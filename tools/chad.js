var fileQueue = require('../db/fileQueue');
var {client} = require('../db/mongo');
var path = require('path');
var {parse} = require('csv-parse/sync');
const { readFileSync } = require('fs');

function loadCsv(csvPath) {
    var data = readFileSync(csvPath);
    var records = parse(data, {
        columns: true,
    });
    var videoIds = [];
    var dedupVideo = new Set();
    for (let row of records) {
        var videoId = row.youtube_id;
        var isAvailable = row.is_available;
        if (isAvailable == 'True' && videoId && !dedupVideo.has(videoId)) {
            videoIds.push(videoId);
            dedupVideo.add(videoId);
        }
    }
    return videoIds;
}

async function main() {
    var chad = process.argv[2];
    var csvPath = path.join(chad, 'metadata/dataset.csv');
    var videoIds = loadCsv(csvPath);
    var i = 0;
    for (let videoId of videoIds) {
        i++;
        await fileQueue.addVideo(videoId);
        if (i % 1000 == 0) {
            console.log(i);
        }
    }
}

async function closeDB() {
    (await client).close();
}

main().finally(closeDB);
