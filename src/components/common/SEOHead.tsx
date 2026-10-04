import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface MetaConfig {
  title: string;
  description: string;
  canonical: string;
  isPrivate?: boolean;
}

const SITE_URL = 'https://www.shikshantaracademy.edu.np';

const SEO_MAP: Record<string, MetaConfig> = {
  '/': {
    title: 'Shikshantar Academy | Bastipur, Karjanha, Siraha',
    description: 'Official website of Shikshantar Academy, premier English-medium school located in Bastipur, Karjanha-05, Siraha, Nepal. Directed by Founder Principal Pappu Kumar Jha.',
    canonical: `${SITE_URL}/`,
  },
  '/about': {
    title: 'About Us | Shikshantar Academy - Bastipur, Karjanha, Siraha',
    description: 'Learn about Shikshantar Academy in Bastipur, Karjanha-05, Siraha. Founded and directed by Principal Pappu Kumar Jha, offering quality schooling from Playgroup to Class 10.',
    canonical: `${SITE_URL}/about`,
  },
  '/facilities': {
    title: 'School Facilities & Campus | Shikshantar Academy, Karjanha, Bastipur',
    description: 'Explore campus facilities at Shikshantar Academy in Bastipur, Karjanha, Siraha: computer lab, science laboratory, library, playground, and student bus transport.',
    canonical: `${SITE_URL}/facilities`,
  },
  '/gallery': {
    title: 'Photo Gallery | Shikshantar Academy - Bastipur, Siraha',
    description: 'Browse photos of campus life, annual functions, sports events, science exhibitions, and classroom activities at Shikshantar Academy Bastipur, Siraha.',
    canonical: `${SITE_URL}/gallery`,
  },
  '/calendar': {
    title: 'Academic Calendar | Shikshantar Academy - Bastipur, Siraha',
    description: 'Official B.S. academic calendar for Shikshantar Academy in Bastipur, Karjanha, Siraha, showing term exams, festivals, and public holidays.',
    canonical: `${SITE_URL}/calendar`,
  },
  '/events': {
    title: 'Events & Activities | Shikshantar Academy - Bastipur, Siraha',
    description: 'Extracurricular events, sports competitions, science exhibitions, and cultural functions at Shikshantar Academy in Bastipur, Siraha.',
    canonical: `${SITE_URL}/events`,
  },
  '/admission': {
    title: 'Admission | Shikshantar Academy, Bastipur, Karjanha, Siraha',
    description: 'Online admissions open at Shikshantar Academy, premier school in Bastipur, Karjanha, Siraha. Apply online for Playgroup to Class 10 with ease.',
    canonical: `${SITE_URL}/admission`,
  },
  '/fee-structure': {
    title: 'Fee Structure & Scholarships | Shikshantar Academy Bastipur, Siraha',
    description: 'Transparent class-wise monthly fees, merit scholarships, and school bus transportation fare chart at Shikshantar Academy in Bastipur, Karjanha, Siraha.',
    canonical: `${SITE_URL}/fee-structure`,
  },
  '/notices': {
    title: 'Notice Board & Circulars | Shikshantar Academy Bastipur, Siraha',
    description: 'Latest official notices, examination schedules, circulars, and announcements from Shikshantar Academy in Bastipur, Karjanha, Siraha.',
    canonical: `${SITE_URL}/notices`,
  },
  '/contact': {
    title: 'Contact Shikshantar Academy | Bastipur, Karjanha, Siraha',
    description: 'Official contact details of Shikshantar Academy in Bastipur, Karjanha-05, Siraha. Phone: +977 9709867048, +977 9807790805. Email: academyshikshantar@gmail.com.',
    canonical: `${SITE_URL}/contact`,
  },
  '/faq': {
    title: 'FAQ & Help | Shikshantar Academy - Bastipur, Karjanha, Siraha',
    description: 'Frequently asked questions about Shikshantar Academy in Bastipur, Karjanha, Siraha: admissions, leadership by Principal Pappu Kumar Jha, contact info, and fees.',
    canonical: `${SITE_URL}/faq`,
  },
  '/alumni': {
    title: 'Alumni & Achievements | Shikshantar Academy Bastipur, Siraha',
    description: 'Connect with alumni of Shikshantar Academy in Bastipur, Siraha, and explore graduate milestones, higher studies, and success stories.',
    canonical: `${SITE_URL}/alumni`,
  },
  // Private / Authenticated Portals
  '/login': {
    title: 'Portal Login | Shikshantar Academy',
    description: 'Secure login portal for students, teachers, and administrators of Shikshantar Academy.',
    canonical: `${SITE_URL}/login`,
    isPrivate: true,
  },
  '/admin': {
    title: 'Admin Dashboard | Shikshantar Academy',
    description: 'Administrative portal for school operations and student management.',
    canonical: `${SITE_URL}/admin`,
    isPrivate: true,
  },
  '/account': {
    title: 'Student Fee Ledger | Shikshantar Academy',
    description: 'Student portal fee ledger and transaction history.',
    canonical: `${SITE_URL}/account`,
    isPrivate: true,
  },
  '/account-admin': {
    title: 'Fee Management Admin | Shikshantar Academy',
    description: 'School financial fee billing and payment administration.',
    canonical: `${SITE_URL}/account-admin`,
    isPrivate: true,
  },
  '/teacher-salary': {
    title: 'Teacher Salary Portal | Shikshantar Academy',
    description: 'Teacher payroll and salary voucher ledger.',
    canonical: `${SITE_URL}/teacher-salary`,
    isPrivate: true,
  },
  '/salary-admin': {
    title: 'Payroll Administration | Shikshantar Academy',
    description: 'School staff payroll generation and disbursement.',
    canonical: `${SITE_URL}/salary-admin`,
    isPrivate: true,
  },
  '/result': {
    title: 'Academic Results Portal | Shikshantar Academy',
    description: 'Term exam marksheets and report card portal.',
    canonical: `${SITE_URL}/result`,
    isPrivate: true,
  },
};

export default function SEOHead() {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname.toLowerCase().replace(/\/$/, '') || '/';
    const config = SEO_MAP[pathname] || {
      title: 'Shikshantar Academy | Bastipur, Karjanha, Siraha',
      description: 'Shikshantar Academy in Bastipur, Karjanha-05, Siraha, offering quality English-medium education from PG to Class 10 under Principal Pappu Kumar Jha.',
      canonical: `${SITE_URL}${pathname}`,
      isPrivate: pathname.startsWith('/admin') || pathname.startsWith('/student-profile') || pathname.startsWith('/user-approvals'),
    };

    // 1. Update Document Title
    document.title = config.title;

    // 2. Update Meta Description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', config.description);

    // 3. Update Canonical Tag
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', config.canonical);

    // 4. Update OpenGraph Tags
    const updateOrCreateMeta = (property: string, content: string) => {
      let meta = document.querySelector(`meta[property="${property}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };

    updateOrCreateMeta('og:title', config.title);
    updateOrCreateMeta('og:description', config.description);
    updateOrCreateMeta('og:url', config.canonical);

    // 5. Update Robots meta for private vs public routes
    let robotsMeta = document.querySelector('meta[name="robots"]');
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.setAttribute('name', 'robots');
      document.head.appendChild(robotsMeta);
    }
    if (config.isPrivate) {
      robotsMeta.setAttribute('content', 'noindex, nofollow');
    } else {
      robotsMeta.setAttribute('content', 'index, follow');
    }
  }, [location.pathname]);

  return null;
}
