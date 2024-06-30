var { MongoClient } = require('mongodb');
require('dotenv').config();

var client = MongoClient.connect(process.env.MONGO_URL);
var db = client.then(cli => cli.db(process.env.MONGO_DB));

module.exports.db = db;
module.exports.client = client;
