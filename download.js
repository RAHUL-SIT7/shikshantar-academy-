import https from 'https';
import fs from 'fs';

const downloadFile = (url, dest) => {
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

async function main() {
  await downloadFile('https://i.postimg.cc/SxGS5WxY/logo.png', 'public/logo.png');
  await downloadFile('https://i.postimg.cc/7LmLCgvb/606350985-1458678509597899-5556893883060728495-n-jpg-stp-dst-jpegr-tt6-nc-cat-111-ccb-1-7-nc-sid-7.jpg', 'public/principal.jpg');
  console.log('Downloaded');
}

main();
