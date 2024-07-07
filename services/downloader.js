var axios = require('axios');

async function updateInstanceList() {
    var req = await ax.get(INSTANCE_API);
    var data = req.data;

    var current = await listInstances();
    var existApi = [];
    for (var instance of data) {
        if (instance.api) {
            existApi.push(instance.api);
            var status = instance.services.youtube ? 'up' : 'down';
            await addOrUpdateInstance(instance.api, status, instance);
        }
    }
    for (var row of current) {
        if (!existApi.includes(row.endpoint)) {
            await deleteInstance(row.endpoint);
        }
    }
}
