import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc, onSnapshot, deleteDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { Save, Settings as SettingsIcon, MonitorPlay, Calendar, Clock, Plus, X, Mail, Key, CheckCircle2, Wrench, ShieldAlert, Copy, ExternalLink, AlertTriangle, Eye } from 'lucide-react';

import ThemeSettings from './ThemeSettings';

const DEFAULT_CONTENT = {
  tagline1: 'Welcome to',
  tagline2: 'Shikshantar Academy',
  description: 'Nurturing minds and building character in the heart of Siraha. We provide quality education with modern facilities, expert faculty, and a commitment to excellence.',
  principalMessage: 'At Shikshantar Academy, we believe in nurturing not just academic excellence, but character, creativity, and critical thinking. Our peaceful environment and modern facilities provide the perfect setting for your child to grow and thrive.',
  announcement: '',
  admissionsBadge: 'Admissions Open 2083 B.S.',
  statsStudents: '200+',
  statsTeachers: '12+',
  statsPassRate: '90%+',
  contactPhone: '+977 9709867048, +977 9807790805',

  // Additional Counter Overrides
  statsLevelRange: "PG — Class 10",
  statsEstYear: "2072 B.S.",

  // Home Video Tour Settings
  showHomeVideo: "true",
  homeVideoUrl: "https://pixabay.com/videos/download/video-246148_medium.mp4",
  homeVideoTitle: "Experience Shikshantar Academy In Its Entirety",
  homeVideoDesc: "Watch student activity, modern laboratories, physical drills, and interactive lessons. Use the controls below to play, pause, mute, seek, or open the widescreen Cinematic Theatre Mode.",

  // Slideshow Slides
  slide1Image: "https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=1200&auto=format&fit=crop",
  slide1Badge: "Holistic Education",
  slide1Title: "Nurturing Minds, Building Character",
  slide1Desc: "Empowering students in Bastipur, Siraha with world-class education, professional educators & modern resources.",
  slide1Link: "/facilities",
  slide1Cta: "🏫 Explore Facilities →",

  slide2Image: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=1200&auto=format&fit=crop",
  slide2Badge: "BALA Classroom Designs",
  slide2Title: "Building as a Learning Aid (BALA)",
  slide2Desc: "Every wall has a story to teach! Custom educational paintings, Nepali Barnamala alphabets, mathematics curves, and geographical world maps are printed onto classroom walls & corridors to spark natural inquiry in our students.",
  slide2Link: "/facilities",
  slide2Cta: "🎨 Tour BALA Classrooms →",

  slide3Image: "https://images.unsplash.com/photo-1562774053-f5a02f6ef87a?q=80&w=1200&auto=format&fit=crop",
  slide3Badge: "English medium instruction",
  slide3Title: "Global Standards, Local Foundations",
  slide3Desc: "Consistently scoring high SEE success benchmarks, under active directorship of Pappu Kumar Jha and specialized teachers.",
  slide3Link: "tel:+9779807790805",
  slide3Cta: "📞 Call Academic Advisors",

  // Academic program sections
  progMontessoriTitle: "🧸 Montessori & Play Group Level",
  progMontessoriDesc: "Our pre-school program introduces toddlers to continuous sensory stimulation, audio-visual play-rooms and playful motor learning. We emphasize loving attention to keep every toddler safe, happy and motivated while building basic English phonetics, shapes and numerals.",
  progMontessoriFeat: "🎨 Dynamic creative spaces\n🧸 Sensory-toy collections\n🥪 Healthy nutrition support\n👩‍⚕️ Dedicated nurse and care staff",
  progMontessoriImg: "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?q=80&w=600&auto=format&fit=crop",

  progPrimaryTitle: "✏️ Primary Schooling (Class 1 to 5)",
  progPrimaryDesc: "At the primary level, we establish robust analytical roots. Following the CDC guidelines of Nepal, classes involve extensive writing, mathematical tables arithmetic, bilingual fluency exercises, environmental studies, and introductory computing logic.",
  progPrimaryFeat: "📖 English Medium curricula\n🧮 Abacus & mental math studies\n🏆 Inter-class debate meets\n🎨 Fine Arts & crafts coaching",
  progPrimaryImg: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?q=80&w=600&auto=format&fit=crop",

  progBasicTitle: "📐 Junior High / Basic School (Class 6 to 8)",
  progBasicDesc: "Preparing young teens for challenges with conceptual mathematics, introductory Physics, Chemistry, Biology experiments, social research assignments, physical drills, and systematic computer lab projects.",
  progBasicFeat: "🔬 Computer & science experimentation\n🧘 Active yoga class sessions\n⚽ Football & sports matches\n🤝 Cultural assemblies & events",
  progBasicImg: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?q=80&w=600&auto=format&fit=crop",

  progSecondaryTitle: "🚀 Secondary & SEE Preparation (Class 9 & 10)",
  progSecondaryDesc: "Our high school program targets maximum grades in Secondary Education Examinations (SEE). Under coaching by veteran subject specialists, pupils undergo weekly tests, pre-board exams, counseling, and detailed revision sessions.",
  progSecondaryFeat: "📊 Regular prep test assignments\n👨‍🏫 Professional review counsel\n🔬 In-depth Science laboratories\n🎯 Individual student grade targets",
  progSecondaryImg: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=600&auto=format&fit=crop",
  
  // Feature Cards
  feature1Title: 'Quality Education',
  feature1Desc: 'Comprehensive curriculum from Play Group to Class 10 following CDC Nepal standards. English medium instruction with focus on Science and Mathematics.',
    feature1Badge: '8+ Core Subjects | Nepali & English Medium',
  feature2Title: 'Expert Faculty',
  feature2Desc: 'Led by Principal Mr. Pappu Kumar Jha and a team of 20+ dedicated, qualified educators with years of teaching experience.',
  feature2Badge: '20+ Teachers | Avg. 8 Years Experience',
  feature3Title: 'Excellent Results',
  feature3Desc: 'Consistent SEE results with above 90%+ pass rate. Producing district toppers every year since 2075 B.S.',
  feature3Badge: '90%+ Pass Rate | District Toppers Every Year',

  // Why Choose Us
  whyChooseTitle: 'Why Choose Shikshantar Academy?',
  whyChooseSub: 'Trusted by 600+ Families in Karjanha Municipality',
  wc1Title: 'Modern Infrastructure',
  wc1Desc: 'Well-equipped classrooms, computer lab, science lab and library',
  wc2Title: 'Science & Computer Lab',
  wc2Desc: 'Hands-on learning with modern equipment for Class 8 and above',
  wc3Title: 'English Medium',
  wc3Desc: 'English as primary medium of instruction for all major subjects',
  wc4Title: 'Regular Assessments',
  wc4Desc: '4 examinations per year with transparent result publishing on portal',
  wc5Title: 'Affordable Fees',
  wc5Desc: 'Quality education at affordable rates',
  wc6Title: 'Central Location',
  wc6Desc: 'Conveniently located at Karjanhana Municipality, Bastipur-5, Siraha, Nepal — easily accessible',

  // Admissions CTA
  admissionsTitle: '🎓 Admissions Open for 2083 B.S.',
  admissionsDesc: 'Shikshantar Academy is now accepting admission applications for academic year 2083 B.S. for Play Group to Class 9.',
  admissionsBullets: 'Play Group to Class 9\nOffline admission only\nEnglish and Nepali mediums available\nResults portal access for all students',
  admInfoTitle: 'Quick Admission Info',
  admInfoSession: '2083 B.S.',
  admInfoClasses: 'PG to Class 9',
  admInfoLocation: 'Karjanhana Municipality, Bastipur-5, Siraha, Nepal',

  // Testimonials
  testiTitle: '💬 What Parents Say',
  testiSub: 'Trusted by families across Siraha',
  testi1Text: "My son's results have improved significantly since joining Shikshantar. The teachers are dedicated and the portal helps us track everything easily.",
  testi1Author: 'Ram Prasad Sharma',
  testi1Role: 'Parent of Class 10 Student',
  testi1Initials: 'RP',
  testi2Text: "Best school in Karjanha Municipality for affordable quality education. My daughter got A+ in Science and Mathematics in SEE.",
  testi2Author: 'Sunita Devi Thapa',
  testi2Role: 'Parent of SEE Graduate 2081',
  testi2Initials: 'SD',
  testi3Text: "The online portal is very helpful. We can check fee receipts and results anytime from our phone. Very convenient for parents.",
  testi3Author: 'Mohan Lal Yadav',
  testi3Role: 'Parent of Class 9 Student',
  testi3Initials: 'ML',

  guardianVoices: [
    {
      id: '1',
      text: "My son's results have improved significantly since joining Shikshantar. The teachers are dedicated and the portal helps us track everything easily.",
      author: 'Ram Prasad Sharma',
      role: 'Parent of Class 10 Student',
      initials: 'RP'
    },
    {
      id: '2',
      text: "Best school in Karjanha Municipality for affordable quality education. My daughter got A+ in Science and Mathematics in SEE.",
      author: 'Sunita Devi Thapa',
      role: 'Parent of SEE Graduate 2081',
      initials: 'SD'
    },
    {
      id: '3',
      text: "The online portal is very helpful. We can check fee receipts and results anytime from our phone. Very convenient for parents.",
      author: 'Mohan Lal Yadav',
      role: 'Parent of Class 9 Student',
      initials: 'ML'
    }
  ],

  // Principal & Contact
  principalName: 'Mr. Pappu Kumar Jha',
  principalTitle: 'Principal, Shikshantar Academy',
  principalImage: 'https://i.postimg.cc/TP6GTp2w/606350985-1458678509597899-5556893883060728495-n-jpg-stp-dst-jpegr-p720x720-tt6-nc-cat-111-ccb-1-7.jpg',
  findUsAddress: 'Bastipur-5, Karjanhana Municipality\nWard No. 05, Siraha,\nMadhesh Pradesh, Nepal'
};

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'content' | 'theme' | 'emailjs' | 'preview'>('content');
  const [previewRole, setPreviewRole] = useState<'guest'|'student'|'teacher'>('guest');
  const [content, setContent] = useState<any>(DEFAULT_CONTENT);
  const [emailConfig, setEmailConfig] = useState({
    serviceId: 'service_aggvbh8',
    templateId: 'template_4aoqz6f',
    publicKey: 'Z6jGixgTs2V12zdq3D-vo',
    toEmail: 'academyshikshantar@gmail.com',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{message: string, type: 'success'|'error'} | null>(null);

  const showFeedback = (message: string, type: 'success'|'error') => {
      setFeedback({ message, type });
      setTimeout(() => setFeedback(null), 5000);
  };

  useEffect(() => {
    const unsubEmail = onSnapshot(doc(db, 'settings', 'emailjs'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setEmailConfig({
          serviceId: data.serviceId || 'service_aggvbh8',
          templateId: data.templateId || 'template_4aoqz6f',
          publicKey: data.publicKey || 'Z6jGixgTs2V12zdq3D-vo',
          toEmail: data.toEmail || 'academyshikshantar@gmail.com',
        });
      }
    });

    const unsub = onSnapshot(doc(db, 'settings', 'home_content'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        if (data.testi2Text) {
            data.testi2Text = data.testi2Text.replace('Karjhanha', 'Karjanha');
        }
        if (data.feature1Badge) {
            data.feature1Badge = data.feature1Badge.replace('6 Core Subjects', '8+ Core Subjects');
        }
        
        // Ensure guardianVoices is populated
        if (!data.guardianVoices || !Array.isArray(data.guardianVoices)) {
          data.guardianVoices = [
            {
              id: '1',
              text: data.testi1Text || DEFAULT_CONTENT.testi1Text,
              author: data.testi1Author || DEFAULT_CONTENT.testi1Author,
              role: data.testi1Role || DEFAULT_CONTENT.testi1Role,
              initials: data.testi1Initials || DEFAULT_CONTENT.testi1Initials
            },
            {
              id: '2',
              text: data.testi2Text || DEFAULT_CONTENT.testi2Text,
              author: data.testi2Author || DEFAULT_CONTENT.testi2Author,
              role: data.testi2Role || DEFAULT_CONTENT.testi2Role,
              initials: data.testi2Initials || DEFAULT_CONTENT.testi2Initials
            },
            {
              id: '3',
              text: data.testi3Text || DEFAULT_CONTENT.testi3Text,
              author: data.testi3Author || DEFAULT_CONTENT.testi3Author,
              role: data.testi3Role || DEFAULT_CONTENT.testi3Role,
              initials: data.testi3Initials || DEFAULT_CONTENT.testi3Initials
            }
          ].filter(item => item.text || item.author);
        }
        
        setContent(data);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'settings/home_content');
    });
    
    return () => {
       unsub();
       unsubEmail();
    };
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = { ...content };
      if (payload.guardianVoices && Array.isArray(payload.guardianVoices)) {
        payload.guardianVoices.forEach((voice, i) => {
          if (i < 3) {
            payload[`testi${i+1}Text`] = voice.text || '';
            payload[`testi${i+1}Author`] = voice.author || '';
            payload[`testi${i+1}Role`] = voice.role || '';
            payload[`testi${i+1}Initials`] = voice.initials || '';
          }
        });
      }
      await setDoc(doc(db, 'settings', 'home_content'), payload);
      showFeedback('Settings saved successfully!', 'success');
    } catch (err) {
      console.error(err);
      showFeedback('Error saving settings.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
          <div className={`p-4 rounded-xl border font-bold flex items-center justify-between ${feedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
              <span>{feedback.type === 'success' ? '✅ ' : '⚠️ '}{feedback.message}</span>
              <button type="button" onClick={() => setFeedback(null)} className="opacity-50 hover:opacity-100"><X className="w-5 h-5"/></button>
          </div>
      )}
      <div className="flex gap-4 border-b border-gray-200 overflow-x-auto scrollbar-hide">
         <button 
           onClick={() => setActiveTab('content')}
           className={`px-4 py-3 font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'content' ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
         >
            Home Content Control
         </button>
         <button 
           onClick={() => setActiveTab('theme')}
           className={`px-4 py-3 font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === 'theme' ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
         >
            Theme Details
         </button>
         <button 
           onClick={() => setActiveTab('emailjs')}
           className={`px-4 py-3 font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'emailjs' ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
         >
            <Mail className="w-4 h-4" /> EmailJS Configuration
         </button>
         <button 
           onClick={() => setActiveTab('preview')}
           className={`px-4 py-3 font-bold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'preview' ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
         >
            <MonitorPlay className="w-4 h-4" /> Preview Dashboard
         </button>
      </div>


      {activeTab === 'content' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-4xl">
           <h2 className="text-xl font-extrabold text-gray-900 mb-6 flex items-center gap-2">
             <SettingsIcon className="w-6 h-6 text-[var(--primary)]" />
             Edit Landing Page Text
           </h2>

           <div className="space-y-5">
            
            <div className="flex flex-col gap-1.5">
               <label className="text-sm font-bold text-gray-700 uppercase tracking-widest text-[11px]">Scrolling Announcement Notice</label>
               <input
                 type="text"
                 placeholder="Type an announcement to show globally, or clear this text to hide the notice bar."
                 value={content.announcement || ''}
                 onChange={(e) => setContent({...content, announcement: e.target.value})}
                 className="w-full border-2 border-gray-200 rounded-lg focus:outline-none focus:border-[var(--primary)] px-3 py-2 text-sm font-medium transition-colors placeholder:text-gray-400 placeholder:opacity-75"
               />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
               <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-gray-700 uppercase tracking-widest text-[11px]">Hero Tagline 1</label>
                  <input
                    type="text"
                    placeholder={DEFAULT_CONTENT.tagline1}
                    value={content.tagline1 || ''}
                    onChange={(e) => setContent({...content, tagline1: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-2 text-sm font-medium placeholder:text-gray-400 placeholder:opacity-75"
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-gray-700 uppercase tracking-widest text-[11px]">Hero Tagline 2</label>
                  <input
                    type="text"
                    placeholder={DEFAULT_CONTENT.tagline2}
                    value={content.tagline2 || ''}
                    onChange={(e) => setContent({...content, tagline2: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-2 text-sm font-medium placeholder:text-gray-400 placeholder:opacity-75"
                  />
               </div>
            </div>

            <div className="flex flex-col gap-1.5">
               <label className="text-sm font-bold text-gray-700 uppercase tracking-widest text-[11px]">Hero Description</label>
               <textarea
                 rows={3}
                 placeholder={DEFAULT_CONTENT.description}
                 value={content.description || ''}
                 onChange={(e) => setContent({...content, description: e.target.value})}
                 className="w-full border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-2 text-sm font-medium placeholder:text-gray-400 placeholder:opacity-75"
               />
            </div>

            <div className="flex flex-col gap-1.5">
               <label className="text-sm font-bold text-gray-700 uppercase tracking-widest text-[11px]">Admissions Badge Notice</label>
               <input
                 type="text"
                 placeholder={DEFAULT_CONTENT.admissionsBadge}
                 value={content.admissionsBadge || ''}
                 onChange={(e) => setContent({...content, admissionsBadge: e.target.value})}
                 className="w-full border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-2 text-sm font-medium placeholder:text-gray-400 placeholder:opacity-75"
               />
            </div>

            <div className="flex flex-col gap-1.5 pt-4 border-t border-gray-100">
               <label className="text-sm font-bold text-gray-700 uppercase tracking-widest text-[11px]">Principal's Message</label>
               <textarea
                 rows={4}
                 placeholder={DEFAULT_CONTENT.principalMessage}
                 value={content.principalMessage || ''}
                 onChange={(e) => setContent({...content, principalMessage: e.target.value})}
                 className="w-full border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-2 text-sm font-medium placeholder:text-gray-400 placeholder:opacity-75"
               />
            </div>

            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-gray-100">
               <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-gray-700 uppercase tracking-widest text-[11px]">Students Count Text (e.g. 200+)</label>
                  <input
                    type="text"
                    placeholder={DEFAULT_CONTENT.statsStudents}
                    value={content.statsStudents || ''}
                    onChange={(e) => setContent({...content, statsStudents: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-2 text-sm font-medium placeholder:text-gray-400 placeholder:opacity-75"
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-gray-700 uppercase tracking-widest text-[11px]">Teachers Count Text (e.g. 12+)</label>
                  <input
                    type="text"
                    placeholder={DEFAULT_CONTENT.statsTeachers}
                    value={content.statsTeachers || ''}
                    onChange={(e) => setContent({...content, statsTeachers: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-2 text-sm font-medium placeholder:text-gray-400 placeholder:opacity-75"
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-gray-700 uppercase tracking-widest text-[11px]">Pass Rate (e.g. 90%+)</label>
                  <input
                    type="text"
                    placeholder={DEFAULT_CONTENT.statsPassRate}
                    value={content.statsPassRate || ''}
                    onChange={(e) => setContent({...content, statsPassRate: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-2 text-sm font-medium placeholder:text-gray-400 placeholder:opacity-75"
                  />
               </div>
               <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-bold text-gray-700 uppercase tracking-widest text-[11px]">Contact Phone</label>
                  <input
                    type="text"
                    placeholder={DEFAULT_CONTENT.contactPhone}
                    value={content.contactPhone || ''}
                    onChange={(e) => setContent({...content, contactPhone: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-2 text-sm font-medium placeholder:text-gray-400 placeholder:opacity-75"
                  />
               </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex justify-end">
               <button 
                 onClick={handleSave} 
                 disabled={isSaving}
                 className="bg-[var(--primary)] text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-opacity-90 disabled:opacity-70"
               >
                 <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Changes'}
               </button>
            </div>
            
            <div className="border-t border-gray-100 pt-4 mt-2">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Advanced Home Content</h3>
              <p className="text-sm text-gray-500 mb-6">Modify all text across the public landing page below. Expand sections to edit.</p>
              
              {[
                {
                  title: 'Hero Slideshow Carousel (3 Slides)',
                  fields: [
                    { key: 'slide1Image', label: 'Slide 1 Background Image URL', type: 'text' },
                    { key: 'slide1Badge', label: 'Slide 1 Mini Badge', type: 'text' },
                    { key: 'slide1Title', label: 'Slide 1 Heading Title', type: 'text' },
                    { key: 'slide1Desc', label: 'Slide 1 Detailed Desc', type: 'textarea' },
                    { key: 'slide1Link', label: 'Slide 1 Destination link', type: 'text' },
                    { key: 'slide1Cta', label: 'Slide 1 Button Action Label', type: 'text' },
                    
                    { key: 'slide2Image', label: 'Slide 2 Background Image URL', type: 'text' },
                    { key: 'slide2Badge', label: 'Slide 2 Mini Badge', type: 'text' },
                    { key: 'slide2Title', label: 'Slide 2 Heading Title', type: 'text' },
                    { key: 'slide2Desc', label: 'Slide 2 Detailed Desc', type: 'textarea' },
                    { key: 'slide2Link', label: 'Slide 2 Destination link', type: 'text' },
                    { key: 'slide2Cta', label: 'Slide 2 Button Action Label', type: 'text' },
                    
                    { key: 'slide3Image', label: 'Slide 3 Background Image URL', type: 'text' },
                    { key: 'slide3Badge', label: 'Slide 3 Mini Badge', type: 'text' },
                    { key: 'slide3Title', label: 'Slide 3 Heading Title', type: 'text' },
                    { key: 'slide3Desc', label: 'Slide 3 Detailed Desc', type: 'textarea' },
                    { key: 'slide3Link', label: 'Slide 3 Destination link', type: 'text' },
                    { key: 'slide3Cta', label: 'Slide 3 Button Action Label', type: 'text' },
                  ]
                },
                {
                  title: 'Key Academic Program Catalogues',
                  fields: [
                    { key: 'progMontessoriTitle', label: 'Montessori Level Title', type: 'text' },
                    { key: 'progMontessoriDesc', label: 'Montessori Level Desc', type: 'textarea' },
                    { key: 'progMontessoriFeat', label: 'Montessori Features (one per line)', type: 'textarea' },
                    { key: 'progMontessoriImg', label: 'Montessori Program Thumbnail URL', type: 'text' },

                    { key: 'progPrimaryTitle', label: 'Primary Level Title', type: 'text' },
                    { key: 'progPrimaryDesc', label: 'Primary Level Desc', type: 'textarea' },
                    { key: 'progPrimaryFeat', label: 'Primary Features (one per line)', type: 'textarea' },
                    { key: 'progPrimaryImg', label: 'Primary Program Thumbnail URL', type: 'text' },

                    { key: 'progBasicTitle', label: 'Basic Level Title', type: 'text' },
                    { key: 'progBasicDesc', label: 'Basic Level Desc', type: 'textarea' },
                    { key: 'progBasicFeat', label: 'Basic Features (one per line)', type: 'textarea' },
                    { key: 'progBasicImg', label: 'Basic Program Thumbnail URL', type: 'text' },

                    { key: 'progSecondaryTitle', label: 'Secondary Level Title', type: 'text' },
                    { key: 'progSecondaryDesc', label: 'Secondary Level Desc', type: 'textarea' },
                    { key: 'progSecondaryFeat', label: 'Secondary Features (one per line)', type: 'textarea' },
                    { key: 'progSecondaryImg', label: 'Secondary Program Thumbnail URL', type: 'text' },
                  ]
                },
                {
                  title: 'Additional Counter Overrides',
                  fields: [
                    { key: 'statsLevelRange', label: 'School Level Range (e.g. PG — Class 10)', type: 'text' },
                    { key: 'statsEstYear', label: 'Establishment Year (e.g. 2072 B.S.)', type: 'text' },
                  ]
                },
                {
                  title: 'Feature Cards (Top row)',
                  fields: [
                    { key: 'feature1Title', label: 'Feature 1 Title', type: 'text' },
                    { key: 'feature1Desc', label: 'Feature 1 Description', type: 'textarea' },
                    { key: 'feature1Badge', label: 'Feature 1 Badge', type: 'text' },
                    { key: 'feature2Title', label: 'Feature 2 Title', type: 'text' },
                    { key: 'feature2Desc', label: 'Feature 2 Description', type: 'textarea' },
                    { key: 'feature2Badge', label: 'Feature 2 Badge', type: 'text' },
                    { key: 'feature3Title', label: 'Feature 3 Title', type: 'text' },
                    { key: 'feature3Desc', label: 'Feature 3 Description', type: 'textarea' },
                    { key: 'feature3Badge', label: 'Feature 3 Badge', type: 'text' },
                  ]
                },
                {
                  title: 'Why Choose Us',
                  fields: [
                    { key: 'whyChooseTitle', label: 'Section Title', type: 'text' },
                    { key: 'whyChooseSub', label: 'Section Subtitle', type: 'text' },
                    ...Array.from({length: 6}).map((_, i) => [
                      { key: `wc${i+1}Title`, label: `Item ${i+1} Title`, type: 'text' },
                      { key: `wc${i+1}Desc`, label: `Item ${i+1} Desc`, type: 'text' }
                    ]).flat()
                  ]
                },
                {
                  title: 'Admissions CTA & Quick Info',
                  fields: [
                    { key: 'admissionsTitle', label: 'Admissions Status Title', type: 'text' },
                    { key: 'admissionsDesc', label: 'Admissions Status Description', type: 'textarea' },
                    { key: 'admissionsBullets', label: 'Bullets (one per line)', type: 'textarea' },
                    { key: 'admInfoTitle', label: 'Quick Info Title', type: 'text' },
                    { key: 'admInfoSession', label: 'Session Line', type: 'text' },
                    { key: 'admInfoClasses', label: 'Classes Line', type: 'text' },
                    { key: 'admInfoLocation', label: 'Location Line', type: 'text' },
                  ]
                },
                {
                  title: 'Testimonials',
                  isTestimonial: true,
                  fields: [
                    { key: 'testiTitle', label: 'Testimonials Title', type: 'text' },
                    { key: 'testiSub', label: 'Testimonials Subtitle', type: 'text' },
                  ]
                },
                {
                  title: 'Principal & Contact Details',
                  fields: [
                    { key: 'principalName', label: 'Principal Name', type: 'text' },
                    { key: 'principalTitle', label: 'Principal Title', type: 'text' },
                    { key: 'principalImage', label: 'Principal Image URL', type: 'text' },
                    { key: 'findUsAddress', label: 'Find Us Address', type: 'textarea' }
                  ]
                },
                {
                  title: 'Home Video Showcase Tour Settings',
                  fields: [
                    { key: 'showHomeVideo', label: 'Show Home Video (set to "true" or "false")', type: 'text' },
                    { key: 'homeVideoUrl', label: 'Video Showcase MP4 File URL', type: 'text' },
                    { key: 'homeVideoTitle', label: 'Video Showcase Title', type: 'text' },
                    { key: 'homeVideoDesc', label: 'Video Showcase Description', type: 'textarea' }
                  ]
                }
              ].map((section, idx) => (
                  <div key={idx} className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50">
                     <h4 className="font-bold text-gray-800 mb-4">{section.title}</h4>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {section.fields.map(f => (
                            <div key={f.key} className={`flex flex-col gap-1.5 ${f.type === 'textarea' ? 'md:col-span-2' : ''}`}>
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{f.label}</label>
                              {f.type === 'textarea' ? (
                                <textarea
                                  rows={3}
                                  placeholder={(DEFAULT_CONTENT as any)[f.key]}
                                  value={(content as any)[f.key] || ''}
                                  onChange={(e) => setContent({...content, [f.key]: e.target.value})}
                                  className="w-full border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-2 text-sm font-medium placeholder:text-gray-400 placeholder:opacity-75"
                                />
                              ) : (
                                <input
                                  type="text"
                                  placeholder={(DEFAULT_CONTENT as any)[f.key]}
                                  value={(content as any)[f.key] || ''}
                                  onChange={(e) => setContent({...content, [f.key]: e.target.value})}
                                  className="w-full border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-2 text-sm font-medium placeholder:text-gray-400 placeholder:opacity-75"
                                />
                              )}
                            </div>
                        ))}

                        {section.isTestimonial && (
                          <div className="md:col-span-2 border-t border-gray-200 pt-5 mt-3">
                            <div className="flex items-center justify-between mb-4 bg-white/55 p-3 rounded-xl border border-gray-200">
                              <div>
                                <h5 className="font-extrabold text-sm text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                                  <span>💬 Guardian Voices</span>
                                  <span className="bg-[#1B4F72] text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                                    {(content.guardianVoices || []).length} Registered
                                  </span>
                                </h5>
                                <p className="text-[11px] text-gray-500 mt-0.5">Manage review quotes, names, and class indicators.</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const newVoice = {
                                    id: Date.now().toString(),
                                    text: '',
                                    author: '',
                                    role: '',
                                    initials: ''
                                  };
                                  setContent({
                                    ...content,
                                    guardianVoices: [...(content.guardianVoices || []), newVoice]
                                  });
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow active:scale-[0.98]"
                              >
                                <Plus className="w-3.5 h-3.5" /> Add Guardian Voice
                              </button>
                            </div>

                            {(!content.guardianVoices || content.guardianVoices.length === 0) ? (
                              <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400 font-sans font-medium text-xs">
                                No guardian voices registered yet. Click the "Add Guardian Voice" button above to register one automatically!
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {(content.guardianVoices || []).map((voice: any, index: number) => (
                                  <div key={voice.id || index} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative transition-all hover:border-gray-300">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (content.guardianVoices || []).filter((v: any, i: number) => {
                                          return v.id ? v.id !== voice.id : i !== index;
                                        });
                                        setContent({
                                          ...content,
                                          guardianVoices: updated
                                        });
                                      }}
                                      className="absolute top-4 right-4 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg p-1.5 transition-colors cursor-pointer"
                                      title="Remove this guardian voice"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>

                                    <span className="inline-block bg-amber-50 text-amber-700 font-bold text-[10px] uppercase px-2 py-0.5 rounded-md mb-3">
                                      Guardian #{index + 1}
                                    </span>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                      <div className="md:col-span-4 flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                          Review / Feedback Quote Text
                                        </label>
                                        <textarea
                                          rows={2}
                                          placeholder="My child enjoys studying here because teachers are extremely caring..."
                                          value={voice.text || ''}
                                          onChange={(e) => {
                                            const updatedVoices = [...(content.guardianVoices || [])];
                                            updatedVoices[index] = { ...updatedVoices[index], text: e.target.value };
                                            setContent({ ...content, guardianVoices: updatedVoices });
                                          }}
                                          className="w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-1.5 text-xs font-medium"
                                        />
                                      </div>

                                      <div className="md:col-span-2 flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                          Guardian / Parent Name
                                        </label>
                                        <input
                                          type="text"
                                          placeholder="e.g. Ram Prasad Sharma"
                                          value={voice.author || ''}
                                          onChange={(e) => {
                                            const updatedVoices = [...(content.guardianVoices || [])];
                                            const authorVal = e.target.value;
                                            let initialsVal = '';
                                            if (authorVal) {
                                              const parts = authorVal.trim().split(/\s+/);
                                              if (parts.length >= 2) {
                                                initialsVal = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                                              } else if (parts[0]) {
                                                initialsVal = parts[0].substring(0, 2).toUpperCase();
                                              }
                                            }
                                            updatedVoices[index] = { 
                                              ...updatedVoices[index], 
                                              author: authorVal,
                                              initials: initialsVal || updatedVoices[index].initials 
                                            };
                                            setContent({ ...content, guardianVoices: updatedVoices });
                                          }}
                                          className="w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-1.5 text-xs font-medium"
                                        />
                                      </div>

                                      <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                          Role / Description
                                        </label>
                                        <input
                                          type="text"
                                          placeholder="e.g. Parent of Class 10 pupil"
                                          value={voice.role || ''}
                                          onChange={(e) => {
                                            const updatedVoices = [...(content.guardianVoices || [])];
                                            updatedVoices[index] = { ...updatedVoices[index], role: e.target.value };
                                            setContent({ ...content, guardianVoices: updatedVoices });
                                          }}
                                          className="w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-1.5 text-xs font-medium"
                                        />
                                      </div>

                                      <div className="flex flex-col gap-1.5">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                          Initials (Auto)
                                        </label>
                                        <input
                                          type="text"
                                          placeholder="e.g. RP"
                                          value={voice.initials || ''}
                                          onChange={(e) => {
                                            const updatedVoices = [...(content.guardianVoices || [])];
                                            updatedVoices[index] = { ...updatedVoices[index], initials: e.target.value };
                                            setContent({ ...content, guardianVoices: updatedVoices });
                                          }}
                                          className="w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] px-3 py-1.5 text-xs font-medium"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                     </div>
                  </div>
              ))}
            </div>

             <div className="pt-4 flex justify-end">
               <button 
                 onClick={handleSave} 
                 disabled={isSaving}
                 className="bg-[var(--primary)] text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-opacity-90 disabled:opacity-70"
               >
                 <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save Changes'}
               </button>
             </div>
           </div>
        </div>
      )}

      {activeTab === 'theme' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
           <ThemeSettings />
        </div>
      )}

      {activeTab === 'emailjs' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-4xl space-y-6">
          <div className="border-b pb-4">
            <h2 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
              <Mail className="w-6 h-6 text-blue-600" />
              EmailJS Service & API Settings
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Configure your EmailJS account details here so all Website Enquiries, Admissions Applications, and Alumni Story notifications are emailed directly to the Principal.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-widest flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-blue-600" /> Service ID
              </label>
              <input
                type="text"
                placeholder="e.g. service_aggvbh8"
                value={emailConfig.serviceId}
                onChange={(e) => setEmailConfig({...emailConfig, serviceId: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-gray-500">Found under EmailJS Dashboard &gt; Email Services</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-widest flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-blue-600" /> Template ID
              </label>
              <input
                type="text"
                placeholder="e.g. fp52orq"
                value={emailConfig.templateId}
                onChange={(e) => setEmailConfig({...emailConfig, templateId: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-gray-500">Found under EmailJS Dashboard &gt; Email Templates</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-widest flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-blue-600" /> Public Key (API Key)
              </label>
              <input
                type="text"
                placeholder="e.g. user_xxx or public key string"
                value={emailConfig.publicKey}
                onChange={(e) => setEmailConfig({...emailConfig, publicKey: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-gray-500">Found under EmailJS Dashboard &gt; Account &gt; API Keys</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-widest flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-blue-600" /> Principal / Target Email
              </label>
              <input
                type="email"
                placeholder="academyshikshantar@gmail.com"
                value={emailConfig.toEmail}
                onChange={(e) => setEmailConfig({...emailConfig, toEmail: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-[11px] text-gray-500">The email address that receives notifications</span>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Settings stored securely in database
            </div>
            <button
              onClick={async () => {
                setIsSaving(true);
                try {
                  await setDoc(doc(db, 'settings', 'emailjs'), emailConfig);
                  showFeedback('EmailJS configuration saved successfully!', 'success');
                } catch (err) {
                  console.error(err);
                  showFeedback('Error saving EmailJS configuration.', 'error');
                } finally {
                  setIsSaving(false);
                }
              }}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 disabled:opacity-70 transition-colors"
            >
              <Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save EmailJS Keys'}
            </button>
          </div>
        </div>
      )}



      {activeTab === 'preview' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
             <span className="text-sm font-bold text-gray-700">Preview View:</span>
             <div className="flex gap-2">
                <button 
                  onClick={() => setPreviewRole('guest')} 
                  className={`px-3 py-1.5 text-sm font-bold rounded flex items-center gap-1 border transition-colors ${previewRole === 'guest' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}
                >
                  <MonitorPlay className="w-4 h-4"/> Guest
                </button>
             </div>
             <p className="text-xs text-gray-500 ml-auto">Changes here show exactly how it looks to users.</p>
          </div>
          <div className="border-4 border-gray-800 rounded-2xl overflow-hidden w-full h-[600px] shadow-xl bg-gray-100 relative max-w-4xl mx-auto">
             <iframe src={`/?previewRole=${previewRole}`} className="w-full h-full border-none"></iframe>
          </div>
        </div>
      )}
    </div>
  );
}
