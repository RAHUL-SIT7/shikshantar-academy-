const https = require('https');
https.get('https://i.postimg.cc/7LmLCgvb/606350985-1458678509597899-5556893883060728495-n-jpg-stp-dst-jpegr-tt6-nc-cat-111-ccb-1-7-nc-sid-7.jpg', (res) => {
  console.log('statusCode:', res.statusCode);
  console.log('headers:', res.headers);
});
