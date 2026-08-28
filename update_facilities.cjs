const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const data = {
  description: 'Our modern infrastructure is designed to provide students with the best possible environment for learning, growth, and extracurricular development.',
  items: [
    {
      id: 'classroom',
      title: 'Classes',
      description: 'Spacious, well-ventilated, and equipped with modern teaching aids. Our classrooms provide a vibrant atmosphere for modern learning.',
      image: 'https://i.postimg.cc/mD4gP09j/conseil-de-classe.jpg',
    },
    {
      id: 'computer-lab',
      title: 'Computer Lab',
      description: 'State-of-art computer lab for practical work and digital skills. Equipped with latest generation PCs and high-speed internet.',
      image: 'https://i.postimg.cc/hvxs2Qj6/068A2257.webp',
    },
    {
      id: 'playground',
      title: 'Sports & Playground',
      description: 'A large playground for various sports and physical activities. Promoting health, teamwork, and sportsmanship among students.',
      image: 'https://i.postimg.cc/VsjXH845/SPORT-Muga-Pitch-1.jpg',
    },
    {
      id: 'science-lab',
      title: 'Science Lab',
      description: 'Fully equipped physics, chemistry, and biology laboratories providing practical exposure and hands-on learning experiences.',
      image: 'https://picsum.photos/seed/sciencelab/800/600',
    },
    {
      id: 'library',
      title: 'Library',
      description: 'A well-stocked library with a vast collection of academic books, reference texts, and periodicals to encourage reading habits.',
      image: 'https://picsum.photos/seed/library/800/600',
    }
  ]
};

async function update() {
  await db.collection('school_data').doc('facilities').set(data);
  console.log('Facilities updated successfully!');
  process.exit(0);
}

update();
