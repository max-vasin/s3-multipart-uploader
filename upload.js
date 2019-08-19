const ProgressBar = require('progress')
const ora = require('ora')
const spinners = require('cli-spinners')
const log = require('consola')
const aws = require('aws-sdk')
const util = require('util')
const fs = require('fs')
const { v4: uuid } = require('uuid')

const openFile = util.promisify(fs.open)
const readFile = util.promisify(fs.read)
const closeFile = util.promisify(fs.close)
const statFile = util.promisify(fs.stat)

const { S3 } = aws

const worker = async (bar, s3, multipart, fd, chunks, chunkSize, offset, sparse) => {
  const buffer = Buffer.alloc(chunkSize)

  const process = async (index, parts) => {
    const part = index * sparse + offset
    const { bytesRead } = await readFile(fd, buffer, 0, chunkSize, part * chunkSize)
    if (bytesRead !== 0) {
      log.debug(`uploading chunk ${index}: ${bytesRead} bytes`)
      const { ETag } = await s3
        .uploadPart({
          ...multipart,
          PartNumber: part + 1,
          Body: buffer
        })
        .promise()

      parts.push({
        ETag,
        PartNumber: part + 1
      })
      bar.tick()
    }

    if (bytesRead < chunkSize) {
      return
    }

    await process(index + 1, parts)
  }

  const parts = []

  await process(0, parts)

  return parts
}

const upload = async (
  source,
  bucket,
  chunks,
  { profile, parallel = 1, fileKey = uuid(), region = 'eu-west-3' }
) => {
  if (profile) {
    aws.config.credentials = new aws.SharedIniFileCredentials({ profile })
  }

  log.debug(`uploading ${source} to ${bucket} using multipart upload with ${parallel} workers`)

  let fd = null

  try {
    let spinner = ora({
      text: 'Preparing',
      spinner: spinners.moon
    }).start()

    log.debug(`determining file ${source} size`)

    const { size } = await statFile(source)

    log.debug(`the file size is ${size} bytes`)

    const chunkSize = Math.floor(size / chunks)

    log.debug(`chunk size is ${chunkSize}`)
    log.debug(`opening file ${source}`)

    fd = await openFile(source, 'r')

    log.debug(`file opened, its descriptor ${fd}`)
    log.debug(`creating S3 multipart upload`)

    const s3 = new S3({
      region
    })

    const { UploadId: uploadId } = await s3
      .createMultipartUpload({
        Bucket: bucket,
        Key: fileKey
      })
      .promise()

    log.debug(`multipart upload ${uploadId} created`)
    log.debug(`spawning ${parallel} workers`)

    spinner.stop()

    const bar = new ProgressBar('Parts: [:bar] :current of :total', {
      width: 30,
      total: Math.ceil(size / chunkSize),
      incomplete: '.',
      complete: '#',
      clear: true
    })
    bar.update(0)

    const workers = []
    const multipart = {
      Bucket: bucket,
      Key: fileKey,
      UploadId: uploadId
    }

    for (let i = 0; i < parallel; i++) {
      workers.push(worker(bar, s3, multipart, fd, chunks, chunkSize, i, parallel))
    }

    const result = await Promise.all(workers)
    const parts = result.reduce((acc, items) => acc.concat(items), [])
    parts.sort((a, b) => {
      if (a.PartNumber >= b.PartNumber) {
        return 1
      }
      return -1
    })

    log.debug(`completing multipart upload`)

    spinner = ora({
      text: 'Completing',
      spinner: spinners.moon
    }).start()

    await s3
      .completeMultipartUpload({
        Bucket: bucket,
        Key: fileKey,
        MultipartUpload: { Parts: parts },
        UploadId: uploadId
      })
      .promise()

    spinner.stop()
    console.log(`${fileKey} uploaded to ${bucket}`)
  } catch (e) {
    log.error(e)
  } finally {
    if (fd !== null) {
      log.debug(`closing the file`)
      await closeFile(fd)
    }
  }
}

module.exports = upload
