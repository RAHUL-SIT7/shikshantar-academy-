const https = require('https');
const fs = require('fs');
const path = require('path');

const download = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

const dir = path.join(__dirname, 'public');
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

Promise.all([
  download('https://i.postimg.cc/7LmLCgvb/606350985-1458678509597899-5556893883060728495-n-jpg-stp-dst-jpegr-tt6-nc-cat-111-ccb-1-7-nc-sid-7.jpg', path.join(dir, 'principal.jpg')),
  download('https://i.postimg.cc/SxGS5WxY/logo.png', path.join(dir, 'logo.png'))
]).then(() => {
  console.log('Downloaded all images successfully');
}).catch((err) => {
  console.error('Failed to download', err);
});
