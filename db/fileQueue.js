var {db} = require('./mongo');

/*
columns:
    video_id: string
    status: notStarted / failed / success / downloading
    create_time: Date
    update_time: Date
    file_name: string
*/

async function addVideo(videoId) {
    var col = (await db).collection('file_queue');
    await col.insertOne({
        video_id: videoId,
        status: 'notStarted',
        create_time: new Date(),
        update_time: new Date(),
    });
}

async function getVideoToDownload() {
    var col = (await db).collection('file_queue');
    return await col.findOne({
        status: 'notStarted'
    });
}

async function updateStatus(videoId, status, more={}) {
    var col = (await db).collection('file_queue');
    return await col.updateOne({
        video_id: videoId
    }, {
        $set: {
            status: status,
            update_time: new Date(),
            ...more
        }
    });
}

async function countVideosByStatus(){
    var col = (await db).collection('file_queue');
    return col.aggregate().group({
        _id: '$status',
        count: {$count: {}}
    }).toArray();
}

module.exports.addVideo = addVideo;
module.exports.getVideoToDownload = getVideoToDownload;
module.exports.updateStatus = updateStatus;
module.exports.countVideosByStatus = countVideosByStatus;
