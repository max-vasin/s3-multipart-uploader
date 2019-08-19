#!/usr/bin/env node

const log = require('consola')
const yargs = require('yargs')

const upload = require('./upload')

yargs
  .command(
    '$0 <source> <bucket> [chunk]',
    'upload a file to S3 using multipart',
    config => {
      config
        .positional('source', {
          describe: 'local file to upload',
          type: 'string'
        })
        .positional('bucket', {
          describe: 'destination S3 bucket you have write access to',
          type: 'string'
        })
        .positional('chunks', {
          describe: 'number of chunks to upload',
          type: 'number',
          default: 10
        })
        .option('profile', {
          describe: 'AWS profile to use as credentials',
          type: 'string'
        })
        .option('region', {
          describe: 'AWS bucket location region',
          type: 'string',
          default: 'eu-west-3'
        })
        .option('parallel', {
          describe: 'Number of simultaneously running uploads',
          type: 'number',
          default: 1
        })
        .option('fileKey', {
          describe: 'File key within target bucket (uuid by default)',
          type: 'string'
        })
    },
    async argv => {
      const { source, bucket, chunks, profile, parallel, fileKey } = argv
      return upload(source, bucket, chunks, {
        profile,
        parallel,
        fileKey
      })
    }
  )
  .middleware(({ verbose }) => {
    log.level = verbose ? 5 : 1
  })
  .showHelpOnFail(false)
  .parse()
