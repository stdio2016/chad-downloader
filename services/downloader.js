var axios = require('axios').default;
const { AxiosError } = require('axios');
const { USER_AGENT, INSTANCE_API } = require('../constants');
const { addOrUpdateInstance, listInstances, deleteInstance, setInstanceQuota, useInstance, incrInstanceSuccess, incrInstanceFail } = require('../db/instance');
const { insertLog } = require('../db/log');
const fs = require('fs');
var contentDisposition = require('content-disposition');
const { getVideoToDownload, updateStatus } = require('../db/fileQueue');
var URL = require('url');
const path = require('path');

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

var retry_delay = 5 * 60 * 1000;
async function randomInstance() {
    var insts = await listInstances();
    var canInst = [];
    var prob = [];
    var probsum = 0;
    var now = new Date();
    var hasQuota = false;
    for (var inst of insts) {
        var p = 0;
        if (inst.status === 'up' && !inst.banned && inst.quota > 0) {
            p = inst.quota;
            if (inst.next_retry && now - inst.next_retry < retry_delay) {
                p = 0;
            }
            if (p > 0) {
                hasQuota = true;
                canInst.push(inst);
                prob.push(p);
                probsum += p;
            }
        }
    }
    if (canInst.length < 1) {
        return { endpoint: null, hasQuota: hasQuota };
    }
    var r = Math.random() * probsum;
    var i;
    for (i = 0; i < prob.length-1; i++) {
        if (r < prob[i]) {
            break;
        }
        r -= prob[i];
    }
    return canInst[i];
}

/**
 * 
 * @param {string} videoId 
 * @param {string} serverFilename 
 */
function genFilename(videoId, serverFilename) {
    var ext = ".mp4";
    var validExts = [".mp3", ".ogg", ".wav", ".opus", ".mp4", ".webm", ".m4a", ".gif"];
    var pos = serverFilename.lastIndexOf('.');
    if (pos !== -1) {
        ext = serverFilename.slice(pos);
        if (!validExts.includes(ext)) {
            ext = ".mp4";
        }
    }
    return videoId + ext;
}

function tryFixStreamUrl(url, instance) {
    if (instance.endpoint === 'api.cobalt.tools') {
        return url;
    }
    var wrongHosts = ['https://api.cobalt.tools/', 'https://co.wuk.sh/', 'http://localhost:9000/']
    for (var host of wrongHosts) {
        if (url.startsWith(host)) {
            console.log('instance %s misconfigured', instance.endpoint);
            var baseURL = instance.protocol + '://' + instance.endpoint;
            return baseURL + '/' + url.slice(host.length);
        }
    }
    return url;
}

async function download(instance, videoId, vCodec) {
    var baseURL = instance.protocol + '://' + instance.endpoint;
    var endpoint = instance.endpoint;
    var url;
    try {
        console.log('%s start', videoId);
        await insertLog(instance.endpoint, videoId, 'started');
        var response = await ax.post('/api/json', {
            url: 'https://youtube.com/watch?v=' + videoId,
            aFormat: 'best',
            isAudioOnly: true,
            filenamePattern: 'basic'
        }, {
            baseURL: baseURL,
            headers: {
                Accept: 'application/json',
            }
        });
        var result = response.data;
        console.log(result);
        await insertLog(endpoint, videoId, '/api/json response', result);

        var text = '' + result.text;
        switch (result.status) {
            case 'stream':
            case 'redirect':
                url = '' + result.url;
                break;
            case 'rate-limit':
                console.log('%s %s api rate limit', videoId, endpoint);
                await insertLog(endpoint, videoId, '/api/json rate limit', result);
                return { status: 'rateLimit', text };
            case 'error':
                console.log('%s %s api error %s', videoId, endpoint, text);
                if (text.includes('try another codec')) {
                    await insertLog(endpoint, videoId, '/api/json format not found', result);
                    return { status: 'tryAnotherCodec' };
                }
                if (text.includes('stop scraping')) {
                    await insertLog(endpoint, videoId, '/api/json instance banned by youtube', result);
                    return { status: 'instanceBroken' };
                }
                if (text.includes('rate limited')) {
                    await insertLog(endpoint, videoId, '/api/json rate limit by youtube', result);
                    return { status: 'rateLimit' };
                }
                if (text.includes("couldn't connect to the service api") || text.includes('servers are down')) {
                    await insertLog(endpoint, videoId, '/api/json service failure', result);
                    return { status: 'networkFailed' };
                }
                await insertLog(endpoint, videoId, '/api/json api error', result);
                return { status: 'failed', text };
            default:
                console.log('instance %s unknown response', endpoint);
                await insertLog(endpoint, videoId, '/api/json unknown response', result);
                return { status: 'instanceBroken' };
        }
    } catch (err) {
        console.error(err);
        if (err instanceof AxiosError) {
            await insertLog(endpoint, videoId, '/api/json network error', {
                message: err.message
            });
        } else {
            await insertLog(endpoint, videoId, 'program error during /api/json', {
                name: err.name,
                message: err.message,
                stack: err.stack,
            });
            return { status: 'programError' };
        }
        return { status: 'networkFailed' };
    }
    return await downloadStreamPhase(instance, endpoint, videoId, url);
}

async function downloadStreamPhase(instance, endpoint, videoId, url, retried) {
    try {
        var fixUrl = tryFixStreamUrl(url, instance);
        var streamResp = await ax.get(fixUrl, {
            responseType: 'stream',
            validateStatus: s => s < 400,
        });
        var serverFilename = '';
        if (streamResp.headers['content-disposition']) {
            var disposition = contentDisposition.parse(streamResp.headers['content-disposition']);
            serverFilename = disposition.parameters.filename + '';
            console.log(serverFilename);
        }
        var filename = genFilename(videoId, serverFilename);
        var fout = fs.createWriteStream(filename);
        var dataIn = streamResp.data;
        try {
            await new Promise((resolve, reject) => {
                dataIn.on('error', reject);
                dataIn.pipe(fout)
                    .on('error', reject)
                    .on('finish', resolve);
            });
        } catch (err) {
            await insertLog(endpoint, videoId, '/api/stream network error', {
                message: err.message,
                status: err.status,
            });
            console.log('network failed');
            return { status: 'networkFailed' };
        }
        await insertLog(endpoint, videoId, 'download success', {
            filename: filename,
            serverFilename: serverFilename
        });
        console.log('%s success', videoId);
        return { status: 'success', filename: filename, serverFilename: serverFilename };
    } catch (err) {
        if (err instanceof AxiosError) {
            await insertLog(endpoint, videoId, '/api/stream network error', {
                message: err.message,
                status: err.status,
            });
            if (err.code === 'ENOTFOUND') {
                console.log('instance %s returned url that we cannot connect', endpoint);
                if (!retried) {
                    if (fout) {
                        fout.close();
                        fout = null;
                    }
                    var parsedUrl = new URL.URL(url);
                    parsedUrl.protocol = instance.protocol;
                    parsedUrl.host = endpoint;
                    return await downloadStreamPhase(instance, endpoint, videoId, parsedUrl.href, true);
                }
                return { status: 'instanceBroken' };
            }
            console.log('network failed');
            return { status: 'networkFailed' };
        } else {
            await insertLog(endpoint, videoId, 'program error during /api/stream', {
                name: err.name,
                message: err.message,
                stack: err.stack,
            });
            console.error(err);
            return { status: 'programError' };
        }
    } finally {
        if (fout) {
            fout.close();
        }
    }
}

function waitRandomTime() {
    var rndTime = Math.random() * 30000 + 10000;
    return new Promise(resolve => setTimeout(resolve, rndTime));
}

function fileSizeCheck(filename) {
    try {
        var fts = fs.statSync(filename);
        return fts.size > 1000;
    } catch (err) {
        return true;
    }
}

function safelyRemoveFile(filename) {
    try {
        fs.unlinkSync(filename);
    } catch (err) {

    }
}

async function downloadLoop(count) {
    for (var i = 0; i < count; i++) {
        var videoObj = await getVideoToDownload();
        if (videoObj === null) {
            break;
        }
        var videoId = videoObj.video_id;
        var instance = await randomInstance();
        if (!instance.endpoint) console.log('all instance rate limit exceeded...');
        while (!instance.endpoint) {
            if (instance.hasQuota) {
                await waitRandomTime();
                instance = await randomInstance();
            } else {
                return { status: 'nextDay' };
            }
        }
        var endpoint = instance.endpoint;
        await useInstance(endpoint);
        var startTime = new Date();
        await updateStatus(videoId, 'downloading', { startTime: startTime });
        var result = await download(instance, videoId);
        switch (result.status) {
            case 'success':
                if (!fileSizeCheck(result.filename)) {
                    console.log('file is too small!!!');
                    safelyRemoveFile(result.filename);
                    await insertLog(endpoint, videoId, 'file is too small', {});
                    await updateStatus(videoId, 'notStarted', {
                        filename: result.filename,
                        serverFilename: result.serverFilename,
                        restart: 'fileTooSmall'
                    });
                    await incrInstanceFail(endpoint);
                    break;
                }
                await updateStatus(videoId, 'success', {
                    filename: result.filename,
                    serverFilename: result.serverFilename
                });
                await incrInstanceSuccess(endpoint);
                fs.renameSync(result.filename, path.join('downloaded', result.filename));
                break;
            case 'failed':
                await updateStatus(videoId, 'failed', { text: result.text });
                await incrInstanceFail(endpoint);
                break;
            case 'networkFailed':
                await updateStatus(videoId, 'notStarted', { restart: 'networkFailed' });
                await incrInstanceFail(endpoint);
                break;
            case 'rateLimit':
                await updateStatus(videoId, 'notStarted', { restart: 'rateLimit' });
                await incrInstanceFail(endpoint);
                break;
            case 'instanceBroken':
                await updateStatus(videoId, 'notStarted', { restart: 'instanceBroken' });
                await setInstanceQuota(endpoint, 0);
                await incrInstanceFail(endpoint);
                break;
            case 'tryAnotherCodec':
                await updateStatus(videoId, 'notStarted', { vCodec: 'mp4' });
                await incrInstanceFail(endpoint);
                break;
            default:
                await updateStatus(videoId, 'failed', { text: result.text });
                await incrInstanceFail(endpoint);
                throw new Error('Unknown status: ' + result.status);
        }
        await waitRandomTime();
    }
    return { status: 'finish' };
}

module.exports.updateInstanceList = updateInstanceList;
module.exports.updateInstanceQuota = updateInstanceQuota;
module.exports.randomInstance = randomInstance;
module.exports.download = download;
module.exports.downloadLoop = downloadLoop;
