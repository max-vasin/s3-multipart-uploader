const log = require('consola')
const aws = require('aws-sdk')

const { S3 } = aws

const upload = async (bucket, user, app, fileKey, { profile, region = 'eu-west-3' }) => {
  if (profile) {
    aws.config.credentials = new aws.SharedIniFileCredentials({ profile })
  }

  const s3 = new S3({ region })
  const prefix = `${user}/${app}/`
  const key = `${prefix}${fileKey}`

  log.debug(`first we'll try to get object directly by key ${key}`)

  let object = null

  try {
    object = await s3
      .headObject({
        Bucket: bucket,
        Key: key
      })
      .promise()
  } catch (e) {
    if (e.code !== 'NotFound') {
      throw e
    }
  }

  if (object) {
    console.log('ready')
    return
  }

  const { Uploads } = await s3
    .listMultipartUploads({
      Bucket: bucket,
      Prefix: prefix
    })
    .promise()

  const activeUploads = Uploads.map(item => item.Key.replace(prefix, ''))
  if (activeUploads.includes(fileKey)) {
    console.log('creating')
    return
  }
  throw Error(`upload ${fileKey} not found!`)
}

module.exports = upload
