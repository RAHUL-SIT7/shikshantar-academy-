import fs from 'fs';

const pages = [
  { file: 'src/pages/About.tsx', title: 'About Us | Shikshantar Academy', desc: 'Learn about the history, mission, and vision of Shikshantar Academy, providing excellence in education in Siraha.' },
  { file: 'src/pages/Facilities.tsx', title: 'Facilities | Shikshantar Academy', desc: 'Explore the modern facilities, science labs, computer labs, and library at Shikshantar Academy.' },
  { file: 'src/pages/Admission.tsx', title: 'Admissions | Shikshantar Academy', desc: 'Apply for admission to Shikshantar Academy. Check fee structures, requirements, and enroll online.' },
  { file: 'src/pages/ContactUs.tsx', title: 'Contact Us | Shikshantar Academy', desc: 'Get in touch with Shikshantar Academy. Find our location, phone number, and email address.' },
  { file: 'src/pages/Gallery.tsx', title: 'Gallery | Shikshantar Academy', desc: 'View photos of events, classroom activities, and campus life at Shikshantar Academy.' },
  { file: 'src/pages/NoticeBoard.tsx', title: 'Notice Board | Shikshantar Academy', desc: 'Stay updated with the latest notices, announcements, and news from Shikshantar Academy.' },
  { file: 'src/pages/AcademicCalendar.tsx', title: 'Academic Calendar | Shikshantar Academy', desc: 'View the academic calendar for the current session at Shikshantar Academy. Check exam dates and holidays.' },
  { file: 'src/pages/Events.tsx', title: 'Events | Shikshantar Academy', desc: 'Discover upcoming and recent events, sports meets, and cultural programs at Shikshantar Academy.' },
  { file: 'src/pages/FeeStructure.tsx', title: 'Fee Structure | Shikshantar Academy', desc: 'View the detailed fee structure for different classes at Shikshantar Academy.' },
  { file: 'src/pages/FAQ.tsx', title: 'FAQ & Help | Shikshantar Academy', desc: 'Find answers to frequently asked questions about Shikshantar Academy.' },
  { file: 'src/pages/Alumni.tsx', title: 'Alumni Network | Shikshantar Academy', desc: 'Connect with the alumni network of Shikshantar Academy. See where our graduates are today.' }
];

pages.forEach(page => {
  if (fs.existsSync(page.file)) {
    let content = fs.readFileSync(page.file, 'utf8');
    
    if (!content.includes('react-helmet-async')) {
      // Add import
      const importRegex = /import React.*?;?\n/;
      content = content.replace(importRegex, `$&import { Helmet } from 'react-helmet-async';\n`);
      
      if (!content.includes('react-helmet-async')) { // fallback
          content = `import { Helmet } from 'react-helmet-async';\n` + content;
      }

      // Add Helmet component just after the first <div ...> return
      const urlPath = page.file.match(/src\/pages\/(.*?)\.tsx/)[1].toLowerCase();
      
      const helmetStr = `
      <Helmet>
        <title>${page.title}</title>
        <meta name="description" content="${page.desc}" />
        <link rel="canonical" href="https://shikshantaracademy.edu.np/${urlPath === 'home' ? '' : urlPath}" />
      </Helmet>
      `;

      // naive replacement for insertion
      // find "return (" then find next "<div"
      const returnIndex = content.indexOf('return (');
      if (returnIndex !== -1) {
          const divIndex = content.indexOf('<div', returnIndex);
          if (divIndex !== -1) {
              const start = content.slice(0, divIndex);
              const divEndIndex = content.indexOf('>', divIndex) + 1;
              const beforeHelmet = content.slice(0, divEndIndex);
              const afterHelmet = content.slice(divEndIndex);
              content = beforeHelmet + helmetStr + afterHelmet;
          }
      }

      fs.writeFileSync(page.file, content);
      console.log(`Updated ${page.file}`);
    }
  }
});
