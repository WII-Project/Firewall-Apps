const express = require('express')
const app = express()
const port = 3009

app.use(express.urlencoded({extended:false}));

app.get('/', (req, res) => {
  res.send(req.query);
})

app.post('/', (req, res) => {
  res.send(req.body);
});


app.get('/error', (req, res) => {
	res.send('The wrong approach. If the error persists, contact admin.');
});

app.listen(port, '127.0.0.1');
