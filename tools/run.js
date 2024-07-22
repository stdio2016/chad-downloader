const { close } = require('../db/mongo');
const downloader = require('../services/downloader');

downloader.downloadLoop(999).then(console.log).finally(close);
