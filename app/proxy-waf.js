const sqlite3 = require("sqlite3").verbose();
const httpProxy = require('http-proxy');
const http = require('http');
const fs = require('fs');

const now = new Date();
const proxy = httpProxy.createProxyServer({});
const db = new sqlite3.Database('./waf.db', err => {
    if(err) {
        console.error(err.message);
    } else {
        console.log("[*] Successful connection to the database 'waf.db'");
    }
});

console.log("[*] Running a waf");
const RuleData = [];

fs.readFileSync("./waf.rule").toString().split('\n').forEach(function(waf_regex) {
    if (waf_regex !== undefined) {
        RuleData.push(waf_regex);
    }
});

const Regex = (re) => {
    return new RegExp(re);
}

const filtering = (re, d) => {
    if(re.exec(d)) {
        return true;
    }
    return false;
}

const waf = (rule, data) => {
    result = true
    for(let i = 0; i < rule.length; i ++ ){
        REGEX = Regex(rule[i]);
        for (key in data) {
            if (key == 'query' || key == 'form') {
                for (p in data[key]){
                    if(filtering(REGEX, data[key][p])) {
                        result = false;
                    }
                    if (result == false) { break }
                };
            }
            if ( result == false ) { break }
            else{
                if(filtering(REGEX, data[key])) {
                    result = false;
                    break
                }
            }
        }
        if (result == false) {
            return result;
        }
    }
    return result;
}

const proxy_request = async (req, res, condition, ip) => {
    await db.all(`select * from waf where ip = ?`, ip, async (err, rows) => {
        // 5회 이상이면 응답을 안 함.
        let count = 0;
        if (rows.length !== 0) {
            count = rows[0].count;
        }
        if (count <= 5) {
            if (condition) {
                await proxy.web(req, res, {
                    target: `http://localhost:3009/`
                });
            } else {
                req.url = '/error';
                req.method = 'GET';
                await proxy.web(req, res, {   
                    target: 'http://localhost:3009/'
                });
            }
        } else {
            console.log(`The ${ip} is block target`);
        }
    });
}

const value_parsing =  (element) => {
    let count = 0
    let searchChar = '='; 
    let pos = element.indexOf(searchChar);

    while (pos !== -1) {
        count++;
        pos = element.indexOf(searchChar, pos + 1);
    }
    
    if (count > 1) {
        return element.substr(element.indexOf('=') + 1, element.length);
    } else {
        return element.split('=')[1];
    }
}

const ip_block = async (req, res , ip) => {
    await db.all(`select * from waf where ip = ?`, ip, (err, rows) => {
        if (err) {throw err;}
        if (rows.length == 0) {
            db.run('insert into waf (ip, count) values(?, ?)', [ip, 1], async (err) => {
                if (err) {console.error(err);} 
                else {
                    console.log('[*] Successful Insert statement execution');
                    await proxy_request(req, res, false);
                }
            });
        } else {
            rows.forEach(async (row) => {
                count = row['count'];
                if (count > 5) {
                    console.log(`The ${ip} is block target`);
                } else {
                    db.run ('update waf set count=? where ip = ?', [count + 1, ip], async (err) => {
                        if (err) {console.error(err)}
                        else {
                            console.log('[*] Successful Update statement execution');
                            await proxy_request(req, res, false);
                        }
                    })
                }
            });
        }
    });
}

http.createServer(function (req, res) {
    setTimeout(async function () {
        const rhost = req.connection.remoteAddress.split('ffff:')[1] ||
            req.socket.remoteAddress.split('ffff:')[1] ||
            req.connection.socket.remoteAddress.split('ffff:')[1];

        console.log(`[*] Connected IP : ${rhost}`)
        const request_data = {'method':'', 'host':'', 'port':'', 'path':''};
        request_data.method = req.method;
        request_data.host = req.headers.host.split(':')[0];
        request_data.port = req.headers.host.split(':')[1]; delete req.headers.host

        Object.keys(req.headers).forEach(element => {
            request_data[element] = req.headers[element];
        })

        if (request_data.method == "GET") {
            if (req.url.includes('?')) {
                request_data.path = req.url.split('?')[0];
            } else {
                request_data.path = req.url;
            }

            if (req.url.includes('?')) {
                request_data.query = {};
                query = decodeURI(req.url).split('?')[1].split('&');
                query.forEach(element => {
                    request_data.query[element.split('=')[0]] = value_parsing(element);
                });
            }
            if(waf(RuleData, request_data)) {
                await proxy_request(req, res, true, rhost);
            } else {
                await ip_block(req, res, rhost)
            }
        } 
        else if (request_data.method == "POST") {
            request_data.path = req.url;
            request_data.form = {};
            query = decodeURIComponent(req['_readableState']['buffer']['head']['data'].toString()).split('&');

            query.forEach(element => {
                request_data.form[element.split('=')[0]] = value_parsing(element);
            });
            if(waf(RuleData, request_data)) {
                await proxy_request(req, res, true, rhost);
            } else {
                await ip_block(req, res, rhost);
            }
        }
        else {
            return "hacking is fuck!!!!!!!!";
        }
    }, 500);
}).listen(8001);
