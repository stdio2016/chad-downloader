var {db} = require('../db/mongo');

/*
columns:
    endpoint: string
    success: int
    fail: int
    quota: int
    status: up / down
    create_time: Date
    update_time: Date
    next_retry: Date
    raw
*/

async function addOrUpdateInstance(endpoint, status, raw) {
    var col = (await db).collection('instance');
    await col.updateOne({
        endpoint: endpoint,
    }, {
        $set: {
            update_time: new Date(),
            raw: raw,
            status: status
        },
        $setOnInsert: {
            success: 0,
            fail: 0,
            quota: 0,
            create_time: new Date(),
        },
    }, {
        upsert: true,
    });
}

async function getInstance(endpoint) {
    var col = (await db).collection('instance');
    return await col.findOne({
        endpoint: endpoint,
    });
}

async function deleteInstance(endpoint) {
    var col = (await db).collection('instance');
    await col.updateOne({
        endpoint: endpoint,
    }, {
        $set: {
            update_time: new Date(),
            status: 'deleted'
        },
    });
}

async function listInstances() {
    var col = (await db).collection('instance');
    return await col.find({}).toArray();
}

module.exports.addOrUpdateInstance = addOrUpdateInstance;
module.exports.getInstance = getInstance;
module.exports.deleteInstance = deleteInstance;
module.exports.listInstances = listInstances;
module.exports.refillInstanceQuota;
module.exports.useInstance;
module.exports.incrInstanceSuccess;
module.exports.incrInstanceFail;
