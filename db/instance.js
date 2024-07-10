var {db} = require('../db/mongo');

/*
columns:
    endpoint: string
    protocol: string
    success: int
    fail: int
    quota: int
    status: up / down
    create_time: Date
    update_time: Date
    next_retry: Date
    raw
*/

async function addOrUpdateInstance(endpoint, protocol, status, raw) {
    var col = (await db).collection('instance');
    await col.updateOne({
        endpoint: endpoint,
    }, {
        $set: {
            update_time: new Date(),
            raw: raw,
            status: status,
            protocol: protocol,
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

async function setInstanceQuota(endpoint, quota) {
    var col = (await db).collection('instance');
    await col.updateOne({
        endpoint: endpoint,
    }, {
        $set: {
            update_time: new Date(),
            quota: quota
        }
    });
}

module.exports.addOrUpdateInstance = addOrUpdateInstance;
module.exports.getInstance = getInstance;
module.exports.deleteInstance = deleteInstance;
module.exports.listInstances = listInstances;
module.exports.setInstanceQuota = setInstanceQuota;
module.exports.useInstance;
module.exports.incrInstanceSuccess;
module.exports.incrInstanceFail;
