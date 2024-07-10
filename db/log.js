var {db} = require('../db/mongo');

async function insertLog(instance, videoId, message, raw) {
    var col = (await db).collection('log');
    await col.insertOne({
        instance,
        video_id: videoId,
        message,
        raw,
        create_time: new Date(),
    });
}

module.exports.insertLog = insertLog;
