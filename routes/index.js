var express = require('express');
var router = express.Router();
var {countVideosByStatus} = require('../db/fileQueue');

/* GET home page. */
router.get('/', async function(req, res, next) {
    var counts = await countVideosByStatus();
    var count = { success: 0, failed: 0, total: 0 };
    for (var st of counts) {
        count[st._id] = st.count;
        count.total += st.count;
    }
    res.render('index', { instances: [], count });
});

module.exports = router;
