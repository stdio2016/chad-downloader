const { close } = require('../db/mongo');
const downloader = require('../services/downloader');

downloader.updateInstanceList().then(downloader.updateInstanceQuota).finally(close);
