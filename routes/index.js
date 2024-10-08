var express = require('express');
var router = express.Router();
var {countVideosByStatus, countRestart} = require('../db/fileQueue');
const { listInstances } = require('../db/instance');

/* GET home page. */
router.get('/', async function(req, res, next) {
    var counts = await countVideosByStatus();
    var instances = await listInstances();
    var count = { success: 0, failed: 0, total: 0 };
    for (var st of counts) {
        count[st._id] = st.count;
        count.total += st.count;
    }
    count.restart = await countRestart();
    res.render('index', { title: 'CHAD downloader', instances, count });
});

module.exports = router;
