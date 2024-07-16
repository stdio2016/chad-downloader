var {db} = require('../db/mongo');

/*
columns:
    endpoint: string
    protocol: string
    success: int
    fail: int
    quota: int
    status: up / down / deleted
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
            quota: quota,
        }
    });
}

async function useInstance(endpoint) {
    var col = (await db).collection('instance');
    return await col.updateOne({
        endpoint: endpoint,
        quota: {$gte: 1},
    }, {
        $set: {
            update_time: new Date(),
            next_retry: new Date(),
        },
        $inc: {
            quota: -1,
        }
    });
}

async function incrInstanceSuccess(endpoint) {
    var col = (await db).collection('instance');
    return await col.updateOne({
        endpoint: endpoint,
    }, {
        $set: {
            update_time: new Date(),
        },
        $inc: {
            success: 1,
        }
    });
}

async function incrInstanceFail(endpoint) {
    var col = (await db).collection('instance');
    return await col.updateOne({
        endpoint: endpoint,
    }, {
        $set: {
            update_time: new Date(),
        },
        $inc: {
            fail: 1,
        }
    });
}

module.exports.addOrUpdateInstance = addOrUpdateInstance;
module.exports.getInstance = getInstance;
module.exports.deleteInstance = deleteInstance;
module.exports.listInstances = listInstances;
module.exports.setInstanceQuota = setInstanceQuota;
module.exports.useInstance = useInstance;
module.exports.incrInstanceSuccess = incrInstanceSuccess;
module.exports.incrInstanceFail = incrInstanceFail;
