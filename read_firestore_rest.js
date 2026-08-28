import fs from 'fs';

const url = "https://firestore.googleapis.com/v1/projects/project-4b410c97-a152-49e7-940/databases/ai-studio-2507c181-4e37-4730-b71a-25b639c27e22/documents/school_data/gallery";

async function run() {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log("HTTP error:", res.status, await res.text());
      return;
    }
    const data = await res.json();
    console.log("SUCCESS_REST_GET");
    fs.writeFileSync("gallery_db_data.json", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

run();
