var axios = require('axios').default;
const { USER_AGENT, INSTANCE_API } = require('../constants');
const { addOrUpdateInstance, listInstances, deleteInstance, setInstanceQuota } = require('../db/instance');
const { insertLog } = require('../db/log');

var ax = axios.create({
    headers: {
        'User-Agent': USER_AGENT,
    },
    validateStatus: () => true,
});

async function updateInstanceList() {
    console.log('updateInstanceList() started');
    try {
        await insertLog('instance', null, 'instance list updating', null);
        var req = await ax.get(INSTANCE_API);
        var data = req.data;

        var current = await listInstances();
        var existApi = [];
        for (var instance of data) {
            if (instance.api) {
                existApi.push(instance.api);
                var status = instance.services.youtube ? 'up' : 'down';
                await addOrUpdateInstance(instance.api, instance.protocol, status, instance);
            }
        }
        for (var row of current) {
            if (!existApi.includes(row.endpoint)) {
                await deleteInstance(row.endpoint);
            }
        }
        await insertLog('instance', null, 'instance list updated', null);
    } catch (err) {
        console.log(err);
        await insertLog('instance', null, 'instance list update error', err+'');
    }
    console.log('updateInstanceList() ended');
}

async function updateInstanceQuota() {
    var current = await listInstances();
    for (var instance of current) {
        await setInstanceQuota(instance.endpoint, 10);
    }
    await insertLog('instance', null, 'quota updated', null);
}

module.exports.updateInstanceList = updateInstanceList;
module.exports.updateInstanceQuota = updateInstanceQuota;
