import { initializeApp } from 'firebase/app';
import { getStorage, ref, listAll, getDownloadURL } from 'firebase/storage';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

const firebaseConfig = {
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId,
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

async function run() {
  console.log("Listing files in media/...");
  const listRef = ref(storage, 'media');
  try {
    const res = await listAll(listRef);
    console.log("Found folders:", res.prefixes.length);
    console.log("Found files:", res.items.length);
    
    const fileData = [];
    for (const itemRef of res.items) {
      const url = await getDownloadURL(itemRef);
      console.log("File:", itemRef.name, "Url:", url);
      fileData.push({
        name: itemRef.name,
        url: url
      });
    }
    
    fs.writeFileSync("storage_files.json", JSON.stringify(fileData, null, 2));
    console.log("SUCCESS_WROTE_STORAGE_FILES");
  } catch (err) {
    console.error("List failed:", err);
  }
}

run();
