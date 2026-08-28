import React, { useRef, useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import HTMLFlipBook from "react-pageflip";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  Edit2,
  Trash2,
  Calendar as CalendarIcon,
  BookOpen,
  List,
  Filter,
  Bell,
  Award,
  Info,
  HelpCircle,
  Clock,
  CheckCircle,
  Tag,
  User,
  Plus,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import NepaliDate from "nepali-date-converter";
import autoTable from "jspdf-autotable";
import jsPDF from "jspdf";
import ModernClockCalendar from "../components/ModernClockCalendar";

const logoImage = "https://i.postimg.cc/nc9G7pRB/image.png";

const DEFAULT_MONTHS_2083 = [
  {
    name: "Baisakh",
    days: 31,
    startDay: 2,
    events: [
      { date: 1, name: "New Year 2083", type: "holiday" },
      { date: 11, name: "Loktantra Diwas", type: "holiday" },
    ],
  },
  {
    name: "Jestha",
    days: 32,
    startDay: 5,
    events: [
      { date: 15, name: "Republic Day", type: "holiday" },
      { date: 20, name: "Buddha Purnima", type: "culture" },
    ],
  },
  {
    name: "Asar",
    days: 31,
    startDay: 1,
    events: [{ date: 15, name: "National Paddy Day", type: "culture" }],
  },
  {
    name: "Shrawan",
    days: 32,
    startDay: 4,
    events: [{ date: 12, name: "Nag Panchami", type: "culture" }],
  },
  {
    name: "Bhadra",
    days: 31,
    startDay: 0,
    events: [
      { date: 14, name: "Teej Festival", type: "culture" },
      { date: 16, name: "Rishi Panchami", type: "culture" },
      { date: 20, name: "Constitution Day", type: "holiday" },
    ],
  },
  {
    name: "Ashwin",
    days: 31,
    startDay: 3,
    events: [
      { date: 7, name: "Ghatasthapana", type: "culture" },
      { date: 14, name: "Dashain Fulpati", type: "holiday" },
      { date: 15, name: "Maha Ashtami", type: "holiday" },
      { date: 16, name: "Maha Navami", type: "holiday" },
      { date: 17, name: "Vijaya Dashami", type: "holiday" },
    ],
  },
  {
    name: "Kartik",
    days: 30,
    startDay: 6,
    events: [
      { date: 4, name: "Laxmi Puja (Tihar)", type: "holiday" },
      { date: 5, name: "Mha Puja", type: "holiday" },
      { date: 6, name: "Bhai Tika", type: "holiday" },
      { date: 11, name: "Chhath Puja", type: "holiday" },
    ],
  },
  { name: "Mangsir", days: 29, startDay: 1, events: [] },
  {
    name: "Poush",
    days: 30,
    startDay: 2,
    events: [{ date: 15, name: "Tamu Lhosar", type: "culture" }],
  },
  {
    name: "Magh",
    days: 29,
    startDay: 4,
    events: [
      { date: 1, name: "Maghi Parba", type: "culture" },
      { date: 5, name: "Sonam Lhosar", type: "culture" },
    ],
  },
  {
    name: "Falgun",
    days: 30,
    startDay: 5,
    events: [
      { date: 7, name: "Democracy Day", type: "holiday" },
      { date: 14, name: "Maha Shivaratri", type: "holiday" },
      { date: 24, name: "Holi Festival", type: "culture" },
      { date: 28, name: "Gyalpo Lhosar", type: "culture" },
    ],
  },
  {
    name: "Chaitra",
    days: 30,
    startDay: 0,
    events: [{ date: 15, name: "Ram Navami", type: "culture" }],
  },
];

const DEFAULT_MONTHS_2084 = [
  {
    name: "Baisakh",
    days: 31,
    startDay: 3,
    events: [
      { date: 1, name: "New Year 2084", type: "holiday" },
      { date: 11, name: "Loktantra Diwas", type: "holiday" },
    ],
  },
  {
    name: "Jestha",
    days: 32,
    startDay: 6,
    events: [
      { date: 15, name: "Republic Day", type: "holiday" },
      { date: 20, name: "Buddha Purnima", type: "culture" },
    ],
  },
  {
    name: "Asar",
    days: 31,
    startDay: 2,
    events: [{ date: 15, name: "National Paddy Day", type: "culture" }],
  },
  {
    name: "Shrawan",
    days: 32,
    startDay: 5,
    events: [{ date: 12, name: "Nag Panchami", type: "culture" }],
  },
  {
    name: "Bhadra",
    days: 31,
    startDay: 1,
    events: [
      { date: 14, name: "Teej Festival", type: "culture" },
      { date: 16, name: "Rishi Panchami", type: "culture" },
      { date: 20, name: "Constitution Day", type: "holiday" },
    ],
  },
  {
    name: "Ashwin",
    days: 31,
    startDay: 4,
    events: [
      { date: 7, name: "Ghatasthapana", type: "culture" },
      { date: 14, name: "Dashain Fulpati", type: "holiday" },
      { date: 15, name: "Maha Ashtami", type: "holiday" },
      { date: 16, name: "Maha Navami", type: "holiday" },
      { date: 17, name: "Vijaya Dashami", type: "holiday" },
    ],
  },
  {
    name: "Kartik",
    days: 30,
    startDay: 0,
    events: [
      { date: 4, name: "Laxmi Puja (Tihar)", type: "holiday" },
      { date: 5, name: "Mha Puja", type: "holiday" },
      { date: 6, name: "Bhai Tika", type: "holiday" },
      { date: 11, name: "Chhath Puja", type: "holiday" },
    ],
  },
  { name: "Mangsir", days: 29, startDay: 2, events: [] },
  {
    name: "Poush",
    days: 30,
    startDay: 3,
    events: [{ date: 15, name: "Tamu Lhosar", type: "culture" }],
  },
  {
    name: "Magh",
    days: 29,
    startDay: 5,
    events: [
      { date: 1, name: "Maghi Parba", type: "culture" },
      { date: 5, name: "Sonam Lhosar", type: "culture" },
    ],
  },
  {
    name: "Falgun",
    days: 30,
    startDay: 6,
    events: [
      { date: 7, name: "Democracy Day", type: "holiday" },
      { date: 14, name: "Maha Shivaratri", type: "holiday" },
      { date: 24, name: "Holi Festival", type: "culture" },
      { date: 28, name: "Gyalpo Lhosar", type: "culture" },
    ],
  },
  {
    name: "Chaitra",
    days: 30,
    startDay: 1,
    events: [{ date: 15, name: "Ram Navami", type: "culture" }],
  },
];

const CALENDAR_YEARS: Record<string, any[]> = {
  "2083": DEFAULT_MONTHS_2083,
  "2084": DEFAULT_MONTHS_2084,
  "2085": [
    {
      name: "Baisakh",
      days: 31,
      startDay: 5,
      events: [
        { date: 1, name: "New Year 2085", type: "holiday" },
        { date: 11, name: "Loktantra Diwas", type: "holiday" },
      ],
    },
    {
      name: "Jestha",
      days: 32,
      startDay: 1,
      events: [
        { date: 15, name: "Republic Day", type: "holiday" },
        { date: 20, name: "Buddha Purnima", type: "culture" },
      ],
    },
    {
      name: "Asar",
      days: 31,
      startDay: 5,
      events: [{ date: 15, name: "National Paddy Day", type: "culture" }],
    },
    {
      name: "Shrawan",
      days: 32,
      startDay: 1,
      events: [{ date: 12, name: "Nag Panchami", type: "culture" }],
    },
    {
      name: "Bhadra",
      days: 31,
      startDay: 5,
      events: [
        { date: 14, name: "Teej Festival", type: "culture" },
        { date: 16, name: "Rishi Panchami", type: "culture" },
        { date: 20, name: "Constitution Day", type: "holiday" },
      ],
    },
    {
      name: "Ashwin",
      days: 31,
      startDay: 1,
      events: [
        { date: 7, name: "Ghatasthapana", type: "culture" },
        { date: 14, name: "Dashain Fulpati", type: "holiday" },
        { date: 15, name: "Maha Ashtami", type: "holiday" },
        { date: 16, name: "Maha Navami", type: "holiday" },
        { date: 17, name: "Vijaya Dashami", type: "holiday" },
      ],
    },
    {
      name: "Kartik",
      days: 30,
      startDay: 4,
      events: [
        { date: 4, name: "Laxmi Puja (Tihar)", type: "holiday" },
        { date: 5, name: "Mha Puja", type: "holiday" },
        { date: 6, name: "Bhai Tika", type: "holiday" },
        { date: 11, name: "Chhath Puja", type: "holiday" },
      ],
    },
    { name: "Mangsir", days: 29, startDay: 6, events: [] },
    {
      name: "Poush",
      days: 30,
      startDay: 0,
      events: [{ date: 15, name: "Tamu Lhosar", type: "culture" }],
    },
    {
      name: "Magh",
      days: 29,
      startDay: 2,
      events: [
        { date: 1, name: "Maghi Parba", type: "culture" },
        { date: 5, name: "Sonam Lhosar", type: "culture" },
      ],
    },
    {
      name: "Falgun",
      days: 30,
      startDay: 3,
      events: [
        { date: 7, name: "Democracy Day", type: "holiday" },
        { date: 14, name: "Maha Shivaratri", type: "holiday" },
        { date: 24, name: "Holi Festival", type: "culture" },
        { date: 28, name: "Gyalpo Lhosar", type: "culture" },
      ],
    },
    {
      name: "Chaitra",
      days: 30,
      startDay: 5,
      events: [{ date: 15, name: "Ram Navami", type: "culture" }],
    },
  ],
  "2086": [
    {
      name: "Baisakh",
      days: 31,
      startDay: 0,
      events: [
        { date: 1, name: "New Year 2086", type: "holiday" },
        { date: 11, name: "Loktantra Diwas", type: "holiday" },
      ],
    },
    {
      name: "Jestha",
      days: 32,
      startDay: 3,
      events: [
        { date: 15, name: "Republic Day", type: "holiday" },
        { date: 20, name: "Buddha Purnima", type: "culture" },
      ],
    },
    {
      name: "Asar",
      days: 31,
      startDay: 0,
      events: [{ date: 15, name: "National Paddy Day", type: "culture" }],
    },
    {
      name: "Shrawan",
      days: 32,
      startDay: 3,
      events: [{ date: 12, name: "Nag Panchami", type: "culture" }],
    },
    {
      name: "Bhadra",
      days: 31,
      startDay: 0,
      events: [
        { date: 14, name: "Teej Festival", type: "culture" },
        { date: 16, name: "Rishi Panchami", type: "culture" },
        { date: 20, name: "Constitution Day", type: "holiday" },
      ],
    },
    {
      name: "Ashwin",
      days: 31,
      startDay: 3,
      events: [
        { date: 7, name: "Ghatasthapana", type: "culture" },
        { date: 14, name: "Dashain Fulpati", type: "holiday" },
        { date: 15, name: "Maha Ashtami", type: "holiday" },
        { date: 16, name: "Maha Navami", type: "holiday" },
        { date: 17, name: "Vijaya Dashami", type: "holiday" },
      ],
    },
    {
      name: "Kartik",
      days: 30,
      startDay: 6,
      events: [
        { date: 4, name: "Laxmi Puja (Tihar)", type: "holiday" },
        { date: 5, name: "Mha Puja", type: "holiday" },
        { date: 6, name: "Bhai Tika", type: "holiday" },
        { date: 11, name: "Chhath Puja", type: "holiday" },
      ],
    },
    { name: "Mangsir", days: 29, startDay: 1, events: [] },
    {
      name: "Poush",
      days: 30,
      startDay: 2,
      events: [{ date: 15, name: "Tamu Lhosar", type: "culture" }],
    },
    {
      name: "Magh",
      days: 29,
      startDay: 4,
      events: [
        { date: 1, name: "Maghi Parba", type: "culture" },
        { date: 5, name: "Sonam Lhosar", type: "culture" },
      ],
    },
    {
      name: "Falgun",
      days: 30,
      startDay: 5,
      events: [
        { date: 7, name: "Democracy Day", type: "holiday" },
        { date: 14, name: "Maha Shivaratri", type: "holiday" },
        { date: 24, name: "Holi Festival", type: "culture" },
        { date: 28, name: "Gyalpo Lhosar", type: "culture" },
      ],
    },
    {
      name: "Chaitra",
      days: 30,
      startDay: 0,
      events: [{ date: 15, name: "Ram Navami", type: "culture" }],
    },
  ],
};

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Quotes based on local calendar values
export const NEP_WISDOM_QUOTES = [
  {
    quoteEn: "Knowing yourself is the beginning of all wisdom.",
    quoteNe: "आफूलाई चिन्नु नै सम्पूर्ण ज्ञानको सुरुवात हो।",
    author: "Aristotle"
  },
  {
    quoteEn: "In the middle of difficulty lies opportunity.",
    quoteNe: "कठिनाइको बीचमा नै अवसर लुकेको हुन्छ।",
    author: "Albert Einstein"
  },
  {
    quoteEn: "To thine own self be true.",
    quoteNe: "आफ्नो प्रति सधैं इमानदार बन।",
    author: "William Shakespeare"
  },
  {
    quoteEn: "An unexamined life is not worth living.",
    quoteNe: "अध्ययन नगरिएको जीवन जिउनुको कुनै अर्थ हुँदैन।",
    author: "Socrates"
  },
  {
    quoteEn: "Be the change that you wish to see in the world.",
    quoteNe: "तिमी संसारमा जुन परिवर्तन हेर्न चाहन्छौ, आफैंबाट सुरु गर।",
    author: "Mahatma Gandhi"
  },
  {
    quoteEn: "Education is the most powerful weapon which you can use to change the world.",
    quoteNe: "शिक्षा सबैभन्दा शक्तिशाली हतियार हो, जसलाई तिमी संसार बदल्न प्रयोग गर्न सक्छौ।",
    author: "Nelson Mandela"
  },
  {
    quoteEn: "You cannot teach a man anything; you can only help him find it within himself.",
    quoteNe: "तपाईंले मानिसलाई केही सिकाउन सक्नुहुन्न, केवल उसलाई आफैंभित्र पत्ता लगाउन मद्दत गर्न सक्नुहुन्छ।",
    author: "Galileo Galilei"
  },
  {
    quoteEn: "If I have seen further it is by standing on the shoulders of Giants.",
    quoteNe: "यदि मैले अरूभन्दा टाढा देख्न सकेको छु भने, त्यो महान व्यक्तिहरूको काँधमा उभिएर हो।",
    author: "Isaac Newton"
  },
  {
    quoteEn: "It does not matter how slowly you go as long as you do not stop.",
    quoteNe: "तिमी कति बिस्तारै हिँड्छौ भन्ने कुराले फरक पार्दैन, जबसम्म तिमी रोकिँदैनौ।",
    author: "Confucius"
  },
  {
    quoteEn: "Learning never exhausts the mind.",
    quoteNe: "सिकाईले मस्तिष्कलाई कहिल्यै थकाउँदैन।",
    author: "Leonardo da Vinci"
  },
  {
    quoteEn: "Alone we can do so little; together we can do so much.",
    quoteNe: "एक्लै हामी धेरै कम गर्न सक्छौं, सँगै मिलेर हामी धेरै गर्न सक्छौं।",
    author: "Helen Keller"
  },
  {
    quoteEn: "Nothing in life is to be feared, it is only to be understood.",
    quoteNe: "जीवनमा डराउनु पर्ने कुरा केही छैन, यसलाई मात्र बुझ्नु पर्ने आवश्यकता छ।",
    author: "Marie Curie"
  },
  {
    quoteEn: "Intelligence is the ability to adapt to change.",
    quoteNe: "बुद्धिमत्ता भनेको परिवर्तनमा अनुकूलन हुन सक्ने क्षमता हो।",
    author: "Stephen Hawking"
  },
  {
    quoteEn: "An investment in knowledge pays the best interest.",
    quoteNe: "ज्ञानमा गरिने लगानीले सबैभन्दा राम्रो प्रतिफल दिन्छ।",
    author: "Benjamin Franklin"
  },
  {
    quoteEn: "The secret of getting ahead is getting started.",
    quoteNe: "अगाडि बढ्ने रहस्य भनेको सुरुवात गर्नु हो।",
    author: "Mark Twain"
  },
  {
    quoteEn: "A journey of a thousand miles begins with a single step.",
    quoteNe: "हजार माइलको यात्रा पनि एक पाइलाबाट सुरु हुन्छ।",
    author: "Lao Tzu"
  },
  {
    quoteEn: "The direction in which education starts a man will determine his future in life.",
    quoteNe: "शिक्षाले मानिसलाई जुन दिशामा डोर्‍याउँछ, त्यसैले उसको भविष्य निर्धारण गर्दछ।",
    author: "Plato"
  },
  {
    quoteEn: "It is not the strongest of the species that survives, but the most adaptable to change.",
    quoteNe: "बाँच्ने जीवहरूमा सबैभन्दा बलियो होइन, बरु परिवर्तनसँग अनुकूल हुन सक्ने जीव उत्कृष्ट हुन्छ।",
    author: "Charles Darwin"
  },
  {
    quoteEn: "What lies behind us and what lies before us are tiny matters compared to what lies within us.",
    quoteNe: "हाम्रो पछाडि के छ र अगाडि के छ भन्ने कुरा हाम्रो भित्र के छ भन्ने कुराको तुलनामा निकै सानो हो।",
    author: "Ralph Waldo Emerson"
  },
  {
    quoteEn: "The way to get started is to quit talking and begin doing.",
    quoteNe: "कुनै कुरा सुरु गर्ने तरिका भनेको कुरा गर्न छोडेर काम गर्न थाल्नु हो।",
    author: "Walt Disney"
  },
  {
    quoteEn: "You can't cross the sea merely by standing and staring at the water.",
    quoteNe: "केवल पानीलाई हेरेर मात्र समुद्र पार गर्न सकिँदैन।",
    author: "Rabindranath Tagore"
  },
  {
    quoteEn: "Genius is one percent inspiration and ninety-nine percent perspiration.",
    quoteNe: "प्रतिभा एक प्रतिशत प्रेरणा र न्यानब्बे प्रतिशत कडा परिश्रम हो।",
    author: "Thomas Edison"
  },
  {
    quoteEn: "We may encounter many defeats but we must not be defeated.",
    quoteNe: "हामीले धेरै पराजयहरू भोग्नुपर्ला तर हामी कहिल्यै पराजित हुनु हुँदैन।",
    author: "Maya Angelou"
  },
  {
    quoteEn: "The only way to do great work is to love what you do.",
    quoteNe: "महान कार्य गर्ने एकमात्र तरिका आफूले गरेको कामलाई माया गर्नु हो।",
    author: "Steve Jobs"
  },
  {
    quoteEn: "Whether you think you can, or you think you can't—you're right.",
    quoteNe: "चाहे तपाईं सोच्नुहोस् कि तपाईं सक्नुहुन्छ, वा सक्नुहुन्न—तपाईं दुवै अवस्थामा सही हुनुहुन्छ।",
    author: "Henry Ford"
  },
  {
    quoteEn: "The future belongs to those who believe in the beauty of their dreams.",
    quoteNe: "भविष्य उनीहरूको हो जसले आफ्ना सपनाहरूको सुन्दरतामा विश्वास गर्छन्।",
    author: "Eleanor Roosevelt"
  },
  {
    quoteEn: "The purpose of our lives is to be happy.",
    quoteNe: "हाम्रो जीवनको मुख्य उद्देश्य खुसी हुनु हो।",
    author: "Dalai Lama"
  },
  {
    quoteEn: "Perfection is not attainable, but if we chase perfection we can catch excellence.",
    quoteNe: "पूर्णता हासिल गर्न नसकिए पनि, यदि हामी पूर्णताको पछि लाग्यौं भने उत्कृष्टता प्राप्त गर्न सक्छौं।",
    author: "Vince Lombardi"
  },
  {
    quoteEn: "Believe you can and you're halfway there.",
    quoteNe: "आफूमाथि विश्वास गर्नुहोस्, तपाईंले आधा बाटो पार गरिसक्नुभयो।",
    author: "Theodore Roosevelt"
  },
  {
    quoteEn: "Knowledge is power.",
    quoteNe: "ज्ञान नै शक्ति हो।",
    author: "Francis Bacon"
  }
];

const PageCover = React.forwardRef<
  HTMLDivElement,
  { children: React.ReactNode }
>(({ children }, ref) => {
  return (
    <div
      className="page page-cover bg-primary text-white border-l-[6px] border-blue-900 shadow-inner flex flex-col justify-center items-center h-full w-full relative"
      ref={ref}
      data-density="hard"
    >
      <div className="page-content h-full w-full flex flex-col justify-center items-center p-8 bg-gradient-to-br from-blue-800 to-slate-950 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
        ></div>
        {children}
      </div>
    </div>
  );
});

const isHolidayEvent = (ev: { name: string; type?: string }) => {
  if (ev.type === "school holiday" || ev.type === "holiday") return true;
  if (
    ev.type === "school function" ||
    ev.type === "event" ||
    ev.type === "exam" ||
    ev.type === "sports"
  )
    return false;
  const lowerName = ev.name.toLowerCase();
  return (
    lowerName.includes("holiday") ||
    lowerName.includes("break") ||
    lowerName.includes("vacation") ||
    lowerName.includes("diwas") ||
    lowerName.includes("day") ||
    lowerName.includes("puja") ||
    lowerName.includes("tika") ||
    lowerName.includes("purnima") ||
    lowerName.includes("lhosar") ||
    lowerName.includes("parba") ||
    lowerName.includes("year") ||
    lowerName.includes("holi") ||
    lowerName.includes("holy")
  );
};

const CalendarPage = React.forwardRef<
  HTMLDivElement,
  {
    month: any;
    monthIndex: number;
    year: string;
    todayBsDate?: { monthIdx: number; date: number } | null;
    onDateClick?: (
      monthIndex: number,
      monthName: string,
      date: number,
      currentEvents: string,
      eventObj?: any,
    ) => void;
    filterType?: string;
  }
>(({ month, monthIndex, year, todayBsDate, onDateClick, filterType }, ref) => {
  return (
    <div
      className="page bg-white shadow-[inset_0_0_5px_rgba(0,0,0,0.1)] h-full w-full relative border border-gray-300"
      ref={ref}
    >
      <div className="p-3 md:p-5 h-full flex flex-col justify-between">
        <div className="text-center mb-1 md:mb-2 border-b-2 border-primary pb-1 md:pb-2 flex-none relative">
          <div className="absolute left-0 top-1 text-gray-300 font-bold opacity-30 text-4xl md:text-5xl pointer-events-none tracking-tighter -mt-2 -ml-2">
            {monthIndex + 1}
          </div>
          <img
            src={logoImage}
            alt="Logo"
            className="hidden md:block absolute right-0 top-0 w-8 h-8 object-contain opacity-50 grayscale"
          />
          <h2 className="text-xl lg:text-2xl font-black text-primary uppercase tracking-widest relative z-10">
            {month.name}
          </h2>
          <p className="text-gray-500 font-bold tracking-[0.2em] md:tracking-[0.3em] text-[8px] md:text-[10px] mt-0.5 md:mt-1">
            Shikshantar Academy | {year} B.S.
          </p>
        </div>

        <div className="flex-1 flex flex-col mb-1 relative overflow-hidden justify-center">
          <div className="grid grid-cols-7 gap-1 mb-1 flex-none">
            {WEEK_DAYS.map((day, i) => (
              <div
                key={day}
                className={`text-center font-black text-[8px] md:text-[9px] uppercase pb-0.5 md:pb-1 border-b border-gray-100 ${i === 0 || i === 6 ? "text-red-500" : "text-gray-600"}`}
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-[1px] md:gap-0.5 text-center flex-1 items-stretch">
            {Array.from({ length: month.startDay }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="border-transparent flex flex-col bg-gray-50/20"
              ></div>
            ))}
            {Array.from({ length: month.days }).map((_, i) => {
              const date = i + 1;
              const globalDayIndex = (month.startDay + i) % 7;
              const isWeekend = globalDayIndex === 0 || globalDayIndex === 6; // Saturday and Sunday are weekends

              const dayEvents = month.events
                ? month.events.filter((e: any) => {
                    if (e.endDate && e.endDate >= e.date) {
                      return date >= e.date && date <= e.endDate;
                    }
                    return e.date === date;
                  })
                : [];

              const isEvent = dayEvents.length > 0;
              const isToday =
                todayBsDate?.monthIdx === monthIndex &&
                todayBsDate?.date === date;

              // Filter active type check
              const isFilteredOut =
                filterType &&
                filterType !== "all" &&
                !dayEvents.some((ev: any) => {
                  if (filterType === "personal") return ev.isPersonal;
                  if (filterType === "holiday")
                    return isHolidayEvent(ev) || isWeekend;
                  if (filterType === "exam") return ev.type === "exam";
                  if (filterType === "sports") return ev.type === "sports";
                  if (filterType === "culture") return ev.type === "culture";
                  return false;
                });

              const hasHoliday = dayEvents.some(isHolidayEvent);
              const hasFunction = dayEvents.some(
                (e) => e.type === "school function",
              );
              const hasNormalEvent = dayEvents.some((e) => e.type === "event");
              const hasExam = dayEvents.some((e) => e.type === "exam");
              const hasSports = dayEvents.some((e) => e.type === "sports");

              const bgClass = isWeekend
                ? "text-red-600 bg-red-50/40 border-red-100"
                : isEvent
                  ? hasHoliday
                    ? "bg-red-50/30 border-red-100/60 text-red-700"
                    : hasExam
                      ? "bg-purple-50/30 border-purple-100/60 text-purple-700"
                      : hasSports
                        ? "bg-emerald-50/30 border-emerald-100/60 text-emerald-700"
                        : hasFunction || hasNormalEvent
                          ? "bg-blue-50/30 border-blue-100/60 text-blue-700"
                          : "bg-blue-50/20 border-gray-100 text-gray-800"
                  : "text-gray-800 bg-white border-gray-100/80";

              return (
                <div
                  key={date}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (onDateClick) {
                      const matchEv = dayEvents[0];
                      onDateClick(
                        monthIndex,
                        month.name,
                        date,
                        matchEv ? matchEv.name : "",
                        matchEv,
                      );
                    }
                  }}
                  className={`p-1 min-h-[3rem] sm:min-h-[4rem] md:min-h-[68px] lg:min-h-[82px] border shadow-[0_1px_2px_rgba(0,0,0,0.02)] rounded-lg flex flex-col items-center justify-start font-bold relative transition-all cursor-pointer hover:bg-gray-100/80 ${bgClass} ${isToday ? "ring-2 ring-primary bg-blue-50/50 z-20 shadow-md transform scale-[1.02]" : ""} ${isFilteredOut ? "opacity-30" : ""}`}
                >
                  <span
                    className={`text-[10px] md:text-[13px] leading-tight mt-0.5 ${isToday ? "bg-primary text-white w-5 h-5 rounded-full flex items-center justify-center -mt-0.5" : ""}`}
                  >
                    {date}
                  </span>
                  {isEvent && !isFilteredOut && (
                    <div className="flex flex-col gap-px w-full items-center px-px mt-px">
                      {dayEvents.slice(0, 2).map((e: any, idx: number) => {
                        const isHoliday = isHolidayEvent(e) || isWeekend;
                        const evStyleClass = e.isPersonal
                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                          : e.type === "exam"
                            ? "bg-purple-100 text-purple-800 border border-purple-200"
                            : e.type === "sports"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                              : isHoliday
                                ? "bg-red-100 text-red-700 border border-red-200"
                                : "bg-blue-100 text-blue-700 border border-blue-200";
                        return (
                          <div
                            key={idx}
                            className={`w-full text-[6px] md:text-[9.5px] font-bold leading-[1.2] text-center rounded px-1 py-0.5 whitespace-nowrap overflow-hidden text-ellipsis ${evStyleClass}`}
                            title={e.name}
                          >
                            {e.name}
                          </div>
                        );
                      })}
                      {dayEvents.length > 2 && (
                        <div className="text-[6px] md:text-[9px] text-gray-500 font-extrabold leading-none mt-0.5">
                          + {dayEvents.length - 2}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Events Section */}
        {month.events && month.events.length > 0 && (
          <div className="flex-none bg-blue-50/70 p-1.5 md:p-2 rounded-xl border border-blue-100 text-[10px] mb-1 overflow-y-auto max-h-16 md:max-h-20 default-scrollbar">
            <div className="font-extrabold text-primary mb-1 uppercase tracking-wider text-[7px] md:text-[8.5px] sticky top-0 bg-blue-50/90 z-10 flex justify-between">
              <span>Events & Schedules</span>
            </div>
            <ul className="text-gray-700 list-none pl-1 space-y-0.5 md:space-y-1">
              {month.events.map((e: any, i: number) => {
                const isHoliday = isHolidayEvent(e);
                let typeBadge = "";
                if (e.isPersonal) typeBadge = "🔑 Personal";
                else if (e.type === "exam") typeBadge = "📝 Exam";
                else if (e.type === "sports") typeBadge = "🏆 Sports";
                else if (isHoliday) typeBadge = "🛑 Holiday";
                else typeBadge = "⚡ Event";

                return (
                  <li
                    key={i}
                    className="flex gap-2 items-start text-[8px] md:text-[9.5px]"
                  >
                    <span
                      className={`font-black shrink-0 w-auto min-w-[12px] ${e.isPersonal ? "text-amber-600" : isHoliday ? "text-red-600" : "text-blue-600"}`}
                    >
                      {e.date}
                      {e.endDate && e.endDate > e.date ? `-${e.endDate}` : ""}
                    </span>
                    <span className="leading-tight font-medium text-gray-700">
                      {e.name}{" "}
                      <span className="text-[7px] text-gray-400 font-bold bg-white border border-gray-100 rounded px-1 ml-1">
                        {typeBadge}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex-none mt-auto pt-1 border-t border-gray-100 flex justify-between text-[8px] md:text-[10px] text-gray-400 font-black uppercase tracking-wider">
          <span>{month.name}</span>
          <span>Page {monthIndex + 1} / 12</span>
        </div>
      </div>
    </div>
  );
});

export default function AcademicCalendar() {
  const [flipSound] = useState(
    new Audio("https://actions.google.com/sounds/v1/foley/book_page_turn.ogg"),
  );
  const bookRef = useRef<any>(null);
  const hasInitiallyTurned = useRef(false);
  const [activeTab, setActiveTab] = useState<"flipbook" | "timeline">(
    "timeline",
  );
  const [selectedMonth, setSelectedMonth] = useState("-1");
  const [selectedYear, setSelectedYear] = useState("2083");
  const [monthsData, setMonthsData] = useState<any[]>(CALENDAR_YEARS["2083"]);
  const [customEventsData, setCustomEventsData] = useState<any>({});
  const [userCustomEventsData, setUserCustomEventsData] = useState<any>({});
  const [isReady, setIsReady] = useState(false);
  const [todayBsDate, setTodayBsDate] = useState<{
    monthIdx: number;
    date: number;
  } | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Rotating Quote State
  const [quoteIdx, setQuoteIdx] = useState(0);

  const role = auth.currentUser
    ? localStorage.getItem("userRole") || "student"
    : "guest";
  const isAdmin = role === "admin";
  const isRegisteredUser =
    role === "admin" || role === "teacher" || role === "student";

  const [editModal, setEditModal] = useState<{
    monthIdx: number;
    monthName: string;
    date: number;
    current: string;
    currentEndDate?: number;
    currentType?: string;
  } | null>(null);
  const [editInput, setEditInput] = useState("");
  const [editEndDateInput, setEditEndDateInput] = useState("");
  const [editTypeInput, setEditTypeInput] = useState("school holiday");
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);

  // Admin Sidebar states
  const [adminMonth, setAdminMonth] = useState("0");
  const [adminDate, setAdminDate] = useState("");
  const [adminEndDate, setAdminEndDate] = useState("");
  const [adminEventName, setAdminEventName] = useState("");
  const [adminEventType, setAdminEventType] = useState("school holiday");

  const parsedDateInt = parseInt(adminDate);
  const isEditingExisting =
    !isNaN(parsedDateInt) &&
    !!customEventsData[`month_${adminMonth}`]?.some(
      (ce: any) => ce.date === parsedDateInt,
    );

  const handleLoadForEdit = (monthIdx: number, ce: any) => {
    setAdminError(null);
    setAdminMonth(monthIdx.toString());
    setAdminDate(ce.date.toString());
    setAdminEndDate(ce.endDate ? ce.endDate.toString() : "");
    setAdminEventName(ce.name || "");
    setAdminEventType(ce.type || "school holiday");
  };

  const handleAdminSave = async () => {
    setAdminError(null);
    if (!adminDate.trim()) {
      setAdminError("Please specify a valid Start Date.");
      return;
    }
    if (!adminEventName.trim()) {
      setAdminError("Please specify a valid Event Name.");
      return;
    }

    setIsSaving(true);
    const newCalData = { ...customEventsData };
    const monthKey = `month_${adminMonth}`;
    if (!newCalData[monthKey]) newCalData[monthKey] = [];

    const parsedDate = parseInt(adminDate);
    const parsedEndDate = adminEndDate ? parseInt(adminEndDate) : null;

    const selectedMonthObj =
      CALENDAR_YEARS[selectedYear]?.[parseInt(adminMonth)];
    const daysInMonth = selectedMonthObj?.days || 32;

    if (isNaN(parsedDate) || parsedDate < 1 || parsedDate > daysInMonth) {
      setAdminError(
        `Start Date must be a valid number between 1 and ${daysInMonth} for ${selectedMonthObj?.name || "the selected month"}.`,
      );
      setIsSaving(false);
      return;
    }

    if (parsedEndDate !== null) {
      if (
        isNaN(parsedEndDate) ||
        parsedEndDate < 1 ||
        parsedEndDate > daysInMonth
      ) {
        setAdminError(
          `End Date must be a valid number between 1 and ${daysInMonth} for ${selectedMonthObj?.name || "the selected month"}.`,
        );
        setIsSaving(false);
        return;
      }
      if (parsedEndDate < parsedDate) {
        setAdminError(
          "End Date cannot be before the Start Date. Please correct the range.",
        );
        setIsSaving(false);
        return;
      }
    }

    const existingIdx = newCalData[monthKey].findIndex(
      (e: any) => e.date === parsedDate,
    );
    if (existingIdx >= 0) {
      newCalData[monthKey][existingIdx].name = adminEventName.trim();
      newCalData[monthKey][existingIdx].type = adminEventType;
      if (parsedEndDate && parsedEndDate > parsedDate)
        newCalData[monthKey][existingIdx].endDate = parsedEndDate;
      else delete newCalData[monthKey][existingIdx].endDate;
    } else {
      const newEvent: any = {
        date: parsedDate,
        name: adminEventName.trim(),
        type: adminEventType,
      };
      if (parsedEndDate && parsedEndDate > parsedDate)
        newEvent.endDate = parsedEndDate;
      newCalData[monthKey].push(newEvent);
    }

    try {
      await setDoc(doc(db, "settings", `calendar_${selectedYear}`), newCalData);
      setAdminDate("");
      setAdminEndDate("");
      setAdminEventName("");
      setAdminEventType("school holiday");
      setAdminError(null);
    } catch (e) {
      setAdminError("Failed saving calendar update to database.");
    }
    setIsSaving(false);
  };

  const handleDeleteCustomEvent = async (monthIdx: string, date: number) => {
    setAdminError(null);
    const newCalData = { ...customEventsData };
    const monthKey = `month_${monthIdx}`;
    if (newCalData[monthKey]) {
      newCalData[monthKey] = newCalData[monthKey].filter(
        (e: any) => e.date !== date,
      );
      setIsSaving(true);
      try {
        await setDoc(
          doc(db, "settings", `calendar_${selectedYear}`),
          newCalData,
        );
      } catch (e) {
        setAdminError("Failed to delete the selected override event.");
      }
      setIsSaving(false);
    }
  };

  const handleDeleteEvent = async (
    monthIdx: number,
    date: number,
    isPersonalEvent: boolean,
  ) => {
    setIsSaving(true);
    const monthKey = `month_${monthIdx}`;
    try {
      if (isPersonalEvent) {
        const newCalData = { ...userCustomEventsData };
        if (!newCalData[monthKey]) newCalData[monthKey] = [];
        newCalData[monthKey] = newCalData[monthKey].filter(
          (e: any) => e.date !== date,
        );
        await setDoc(
          doc(db, "userCalendars", `${auth.currentUser?.uid}_${selectedYear}`),
          newCalData,
        );
      } else {
        const newCalData = { ...customEventsData };
        if (!newCalData[monthKey]) newCalData[monthKey] = [];

        // Check if there is a default static event in CALENDAR_YEARS
        const isDefaultEvent = !!CALENDAR_YEARS[selectedYear]?.[
          monthIdx
        ]?.events?.find((ev: any) => ev.date === date);

        if (isDefaultEvent) {
          // If it is a default static event, mask/hide it by setting its name to empty
          const existingIdx = newCalData[monthKey].findIndex(
            (e: any) => e.date === date,
          );
          if (existingIdx >= 0) {
            newCalData[monthKey][existingIdx].name = "";
          } else {
            newCalData[monthKey].push({
              date,
              name: "",
              type: "school holiday",
            });
          }
        } else {
          // If it's a completely custom school event, delete it completely
          newCalData[monthKey] = newCalData[monthKey].filter(
            (e: any) => e.date !== date,
          );
        }
        await setDoc(
          doc(db, "settings", `calendar_${selectedYear}`),
          newCalData,
        );
      }
    } catch (err) {
      console.error("Failed to delete event:", err);
    }
    setIsSaving(false);
  };

  const handleYearChange = async (newYear: string) => {
    setSelectedYear(newYear);
    if (isAdmin) {
      try {
        await setDoc(
          doc(db, "settings", "calendar_meta"),
          { activeYear: newYear },
          { merge: true },
        );
      } catch (e) {}
    }
  };

  useEffect(() => {
    let defaultMonthIdx = -1;
    try {
      const currentDate = new NepaliDate();
      defaultMonthIdx = currentDate.getMonth();
      setSelectedMonth(defaultMonthIdx.toString());
      setTodayBsDate({
        monthIdx: currentDate.getMonth(),
        date: currentDate.getDate(),
      });
      setQuoteIdx(currentDate.getDate() % NEP_WISDOM_QUOTES.length);
    } catch (e) {}

    const unsubMeta = onSnapshot(
      doc(db, "settings", "calendar_meta"),
      (snap) => {
        if (snap.exists() && snap.data()?.activeYear) {
          setSelectedYear(snap.data().activeYear);
        }
      },
      (err) => console.warn(err),
    );
    return () => unsubMeta();
  }, []);

  useEffect(() => {
    if (bookRef.current && bookRef.current.pageFlip()) {
      try {
        bookRef.current.pageFlip().turnToPage(0);
      } catch (e) {}
    }

    const unsub1 = onSnapshot(
      doc(db, "settings", `calendar_${selectedYear}`),
      (snap) => {
        if (snap.exists()) setCustomEventsData(snap.data());
        else setCustomEventsData({});
      },
      (err) => console.warn(err),
    );

    let unsub2 = () => {};
    if (auth.currentUser && auth.currentUser.uid) {
      unsub2 = onSnapshot(
        doc(db, "userCalendars", `${auth.currentUser.uid}_${selectedYear}`),
        (snap) => {
          if (snap.exists()) setUserCustomEventsData(snap.data());
          else setUserCustomEventsData({});
        },
        (err) => console.warn(err),
      );
    }

    return () => {
      unsub1();
      unsub2();
    };
  }, [selectedYear]);

  useEffect(() => {
    if (!CALENDAR_YEARS[selectedYear]) return;
    const newMonths = CALENDAR_YEARS[selectedYear].map((m, idx) => {
      const monthCustomEvents = customEventsData[`month_${idx}`] || [];
      const monthUserCustomEvents = userCustomEventsData[`month_${idx}`] || [];
      const combinedEvents = [...m.events];

      // Apply global events
      monthCustomEvents.forEach((ce: any) => {
        const existingIdx = combinedEvents.findIndex((e) => e.date === ce.date);
        if (existingIdx >= 0)
          combinedEvents[existingIdx] = { ...ce, isGlobal: true };
        else combinedEvents.push({ ...ce, isGlobal: true });
      });

      // Apply personal events
      monthUserCustomEvents.forEach((ce: any) => {
        const existingIdx = combinedEvents.findIndex((e) => e.date === ce.date);
        if (existingIdx >= 0) {
          if (ce.name === "") {
            // Revert to original or skip
          } else {
            combinedEvents[existingIdx] = {
              ...combinedEvents[existingIdx],
              ...ce,
              name: ce.name,
              isPersonal: true,
            };
          }
        } else {
          if (ce.name !== "") combinedEvents.push({ ...ce, isPersonal: true });
        }
      });

      return {
        ...m,
        events: combinedEvents
          .sort((a, b) => a.date - b.date)
          .filter((e) => e.name !== ""),
      };
    });
    setMonthsData(newMonths);
    setIsReady(true);
  }, [selectedYear, customEventsData, userCustomEventsData]);

  const handleDateClick = (
    monthIdx: number,
    monthName: string,
    date: number,
    current: string,
    eventObj?: any,
  ) => {
    if (!isRegisteredUser) return;
    if (isAdmin) {
      setAdminMonth(monthIdx.toString());
      setAdminDate(date.toString());
      setAdminEndDate(eventObj?.endDate ? eventObj.endDate.toString() : "");
      setAdminEventName(current || "");
      setAdminEventType(eventObj?.type || "school holiday");
      const adminPanel = document.querySelector(
        ".bg-white.rounded-3xl.shadow-sm.border.border-gray-100.p-6",
      );
      if (adminPanel) {
        adminPanel.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      setEditModal({
        monthIdx,
        monthName,
        date,
        current,
        currentEndDate: eventObj?.endDate,
        currentType: eventObj?.type,
      });
      setEditInput(current);
      setEditEndDateInput(eventObj?.endDate ? eventObj.endDate.toString() : "");
      setEditTypeInput(eventObj?.type || "school holiday");
    }
  };

  const saveEvent = async () => {
    if (!editModal) return;
    setIsSaving(true);

    const targetDoc = isAdmin
      ? doc(db, "settings", `calendar_${selectedYear}`)
      : doc(db, "userCalendars", `${auth.currentUser?.uid}_${selectedYear}`);

    const baseData = isAdmin ? customEventsData : userCustomEventsData;
    const newCalData = { ...baseData };
    const monthKey = `month_${editModal.monthIdx}`;
    if (!newCalData[monthKey]) newCalData[monthKey] = [];

    const existingIdx = newCalData[monthKey].findIndex(
      (e: any) => e.date === editModal.date,
    );
    const parsedEndDate = editEndDateInput ? parseInt(editEndDateInput) : null;

    if (editInput.trim() === "") {
      if (existingIdx >= 0) {
        newCalData[monthKey][existingIdx].name = "";
        delete newCalData[monthKey][existingIdx].endDate;
        delete newCalData[monthKey][existingIdx].type;
      } else {
        newCalData[monthKey].push({
          date: editModal.date,
          name: "",
          type: editTypeInput,
        });
      }
    } else {
      if (existingIdx >= 0) {
        newCalData[monthKey][existingIdx].name = editInput;
        newCalData[monthKey][existingIdx].type = editTypeInput;
        if (parsedEndDate && parsedEndDate > editModal.date)
          newCalData[monthKey][existingIdx].endDate = parsedEndDate;
        else delete newCalData[monthKey][existingIdx].endDate;
      } else {
        const newEvent: any = {
          date: editModal.date,
          name: editInput,
          type: editTypeInput,
        };
        if (parsedEndDate && parsedEndDate > editModal.date)
          newEvent.endDate = parsedEndDate;
        newCalData[monthKey].push(newEvent);
      }
    }

    try {
      await setDoc(targetDoc, newCalData);
      setEditModal(null);
    } catch (e) {
      alert("Failed to save update");
    }
    setIsSaving(false);
  };

  useEffect(() => {
    if (
      isReady &&
      selectedMonth !== "-1" &&
      bookRef.current &&
      !hasInitiallyTurned.current &&
      activeTab === "flipbook"
    ) {
      hasInitiallyTurned.current = true;
      setTimeout(() => {
        try {
          bookRef.current?.pageFlip()?.turnToPage(parseInt(selectedMonth) + 1);
        } catch (e) {}
      }, 300);
    }
  }, [isReady, activeTab]);

  const onFlip = (e: any) => {
    flipSound.currentTime = 0;
    flipSound.play().catch(() => {});
    const pageIndex = e.data;
    setSelectedMonth(pageIndex === 0 ? "-1" : (pageIndex - 1).toString());
  };

  const nextButtonClick = () => {
    bookRef.current?.pageFlip().flipNext();
  };

  const prevButtonClick = () => {
    bookRef.current?.pageFlip().flipPrev();
  };

  const handleJumpToMonth = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedMonth(val);
    if (activeTab === "flipbook" && bookRef.current) {
      bookRef.current.pageFlip().turnToPage(parseInt(val) + 1);
    }
  };

  const downloadPDF = () => {
    const doc = new jsPDF("p", "pt", "a4");

    // Header
    doc.addImage(logoImage, "PNG", 40, 30, 50, 50);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 58, 138); // Primary color
    doc.text("Shikshantar Academy", 100, 50);
    doc.setFontSize(14);
    doc.setTextColor(100, 100, 100);
    doc.text(`Academic Calendar - ${selectedYear} B.S.`, 100, 70);

    let currentY = 100;

    monthsData.forEach((month) => {
      if (month.events.length === 0) return;

      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 58, 138);
      doc.text(month.name, 40, currentY);
      currentY += 15;

      const tableData = month.events.map((e: any) => [
        `${e.date} ${month.name}`,
        e.name,
        isHolidayEvent(e) ? "Holiday" : e.type || "Event",
      ]);

      autoTable(doc, {
        startY: currentY,
        head: [["Date", "Event / Schedule", "Type"]],
        body: tableData,
        theme: "grid",
        headStyles: { fillColor: [30, 58, 138] },
        margin: { left: 40, right: 40 },
      });

      currentY = (doc as any).lastAutoTable.finalY + 30;
    });

    doc.save(`Shikshantar_Academy_Calendar_${selectedYear}.pdf`);
  };

  // Helper values for active date details
  const getTodayEvents = () => {
    if (todayBsDate === null || !monthsData[todayBsDate.monthIdx]) return [];
    const activeMonth = monthsData[todayBsDate.monthIdx];
    return activeMonth.events.filter((e: any) => {
      if (e.endDate && e.endDate >= e.date) {
        return todayBsDate.date >= e.date && todayBsDate.date <= e.endDate;
      }
      return e.date === todayBsDate.date;
    });
  };

  const getUpcomingEvents = () => {
    const list: any[] = [];
    if (!monthsData.length || todayBsDate === null) return list;

    let monthIdx = todayBsDate.monthIdx;
    let limit = 5;

    // Cycle through current and future months to collect next 5 upcoming events
    for (let offset = 0; offset < 12; offset++) {
      const idx = (monthIdx + offset) % 12;
      const m = monthsData[idx];
      m.events.forEach((ev: any) => {
        // if same month, only collect future events
        if (offset === 0 && ev.date < todayBsDate.date) return;
        list.push({ ...ev, monthName: m.name, monthIdx: idx });
      });
      if (list.length >= limit) break;
    }
    return list.slice(0, limit);
  };

  const todayEvents = getTodayEvents();
  const upcomingEvents = getUpcomingEvents();

  if (!isReady) return null;

  // Filter events based on search query and category
  const getFilteredEventsForList = () => {
    const list: any[] = [];
    monthsData.forEach((m, mIdx) => {
      m.events.forEach((e: any) => {
        const isMatchQuery =
          searchQuery === "" ||
          e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.name.toLowerCase().includes(searchQuery.toLowerCase());
        let isMatchCategory = true;
        if (filterType !== "all") {
          if (filterType === "personal") isMatchCategory = !!e.isPersonal;
          else if (filterType === "holiday")
            isMatchCategory = isHolidayEvent(e);
          else if (filterType === "exam") isMatchCategory = e.type === "exam";
          else if (filterType === "sports")
            isMatchCategory = e.type === "sports";
          else if (filterType === "culture")
            isMatchCategory = e.type === "culture";
        }
        if (isMatchQuery && isMatchCategory) {
          list.push({ ...e, monthName: m.name, monthIdx: mIdx });
        }
      });
    });
    return list;
  };

  const activeFilteredList = getFilteredEventsForList();

  return (
    <div className="w-full max-w-7xl mx-auto p-4 lg:p-6 flex flex-col items-center">
      <Helmet>
        <title>Academic Calendar {selectedYear} | Shikshantar Academy</title>
      </Helmet>

      {/* HEADER CONTROLS */}
      <div className="w-full relative sm:sticky sm:top-0 z-30 bg-white/95 backdrop-blur-md border border-gray-100 rounded-3xl p-6 shadow-md mb-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="text-left flex flex-col items-start gap-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-blue-50 border border-blue-100 px-3 py-1 rounded-full flex items-center gap-1.5">
            CENTRAL SCHOOL SCHEDULER
          </span>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
            Academic Calendar {selectedYear}
          </h1>
          <p className="text-gray-500 font-medium text-sm">
            Interactive school event planner & central hub for Shikshantar
            Academy.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-center w-full md:w-auto justify-end">
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
            <label className="text-xs font-black text-gray-500 uppercase">
              Active Year:
            </label>
            {isAdmin ? (
              <select
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value)}
                className="bg-transparent font-bold text-sm text-gray-800 outline-none cursor-pointer"
              >
                {Object.keys(CALENDAR_YEARS)
                  .sort()
                  .map((y) => (
                    <option key={y} value={y}>
                      {y} B.S.
                    </option>
                  ))}
              </select>
            ) : (
              <span className="font-extrabold text-sm text-gray-800 px-1">
                {selectedYear} B.S.
              </span>
            )}
          </div>

          <button
            onClick={downloadPDF}
            className="bg-primary hover:bg-blue-800 text-white px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-md active:scale-95"
          >
            <Download className="w-4 h-4" /> Get PDF Calendar
          </button>
        </div>
      </div>

      {/* ROW 1: TODAY'S STATUS & MODERN ANALOG CLOCK */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full mb-6">
        {/* TODAY'S WISDOM & STATUS */}
        <div className="bg-gradient-to-br from-blue-900 to-slate-950 text-white rounded-3xl p-6 shadow-xl border border-blue-950 flex flex-col relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-5">
              <CalendarIcon className="w-40 h-40" />
            </div>

            <div className="flex justify-between items-center mb-5 z-10">
              <span className="text-[9px] font-black uppercase tracking-widest bg-white/10 px-2.5 py-1 rounded-full flex items-center gap-1 border border-white/5">
                <Clock className="w-3 h-3 text-amber-400" /> Today's Status
              </span>
              <span className="text-xs font-bold text-blue-200 flex items-center gap-1 bg-blue-900/40 border border-blue-800/50 px-2 py-1 rounded-lg">
                {todayBsDate
                  ? `Month: ${monthsData[todayBsDate.monthIdx]?.name}`
                  : ""}
              </span>
            </div>

            <div className="z-10 mb-5">
              <p className="text-blue-200 text-xs font-bold uppercase tracking-widest">
                Nepali Calendar (B.S.)
              </p>
              <p className="text-4xl font-black text-white mt-1">
                {todayBsDate
                  ? `${todayBsDate.date} ${monthsData[todayBsDate.monthIdx]?.name} ${selectedYear}`
                  : "Loading..."}
              </p>
              <p className="text-xs text-blue-300 font-medium mt-1 flex items-center gap-1.5">
                <span>
                  Standard A.D:{" "}
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </p>
            </div>

            {/* Dynamic Status Notification */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 z-10 mb-5 text-sm">
              {(() => {
                const dayOfWeek = new Date().getDay(); // 0 = Sunday, 6 = Saturday
                const isWeekendToday = dayOfWeek === 0 || dayOfWeek === 6;
                const activeHolidays = todayEvents.filter(isHolidayEvent);

                if (isWeekendToday) {
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                        <p className="font-bold text-red-300 text-xs uppercase tracking-wider">
                          School is Closed today (Weekend)
                        </p>
                      </div>
                      {todayEvents.length > 0 && (
                        <div className="pt-2 border-t border-white/5 space-y-1">
                          <p className="text-blue-300 font-bold text-[10px] uppercase tracking-wider">
                            Scheduled Today:
                          </p>
                          {todayEvents.map((ev, i) => (
                            <p key={i} className="font-semibold text-gray-200 text-xs">
                              {ev.name} {isHolidayEvent(ev) ? "🛑" : "⭐"}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                if (activeHolidays.length > 0) {
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                        <p className="font-bold text-red-300 text-xs uppercase tracking-wider">
                          School is Closed today (Holiday)
                        </p>
                      </div>
                      <div className="pt-2 border-t border-white/5 space-y-1">
                        {todayEvents.map((ev, i) => (
                          <p key={i} className="font-extrabold text-white text-sm leading-snug">
                            {ev.name} 🛑 (Public Holiday)
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (todayEvents.length > 0) {
                  return (
                    <div className="space-y-2">
                      <p className="text-amber-300 font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Bell className="w-3.5 h-3.5 animate-bounce" /> Active Event Today:
                      </p>
                      {todayEvents.map((ev, i) => (
                        <p key={i} className="font-extrabold text-white text-sm leading-snug">
                          {ev.name} ⭐
                        </p>
                      ))}
                    </div>
                  );
                }

                return (
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400"></div>
                    <p className="font-bold text-emerald-300 text-xs uppercase tracking-wider">
                      School is Running Regularly today
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* Rotating Nepali Quote / Ukhan */}
            <div className="border-t border-white/10 pt-4 mt-auto">
              <p className="text-blue-300 text-[10px] uppercase font-black tracking-widest mb-1.5">
                Daily Wisdom / Proverb
              </p>
              <div className="space-y-2">
                <p className="italic font-bold text-sm text-gray-100">
                  "{NEP_WISDOM_QUOTES[quoteIdx]?.quoteEn || ""}"
                </p>
                {NEP_WISDOM_QUOTES[quoteIdx]?.quoteNe && (
                  <p className="font-semibold text-xs text-gray-300">
                    "{NEP_WISDOM_QUOTES[quoteIdx]?.quoteNe}"
                  </p>
                )}
              </div>
              <p className="text-[10px] text-amber-400 font-bold mt-2 text-right">
                — {NEP_WISDOM_QUOTES[quoteIdx]?.author || "Wisdom"}
              </p>
            </div>
          </div>

          {/* Modern Analog Clock and Dual Calendar Synchronization */}
          <ModernClockCalendar />
      </div>

      {/* ROW 2: UPCOMING EVENTS & INTERACTIVE DESK GUIDELINES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full mb-6">
        {/* UPCOMING EVENTS QUICK LEDGER */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col gap-4">
          <h3 className="text-base font-black text-gray-900 uppercase tracking-wider flex items-center justify-between">
            <span>📅 Next 5 Upcoming Events</span>
            <span className="text-xs bg-gray-100 text-gray-500 font-black px-2 py-0.5 rounded-md">
              Quick Lookout
            </span>
          </h3>
          {upcomingEvents.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {upcomingEvents.map((ev, i) => {
                const isHoliday = isHolidayEvent(ev);
                return (
                  <div
                    key={i}
                    className="flex gap-3 items-center bg-gray-50/50 hover:bg-gray-50 border border-gray-100 p-3 rounded-2xl transition-all"
                  >
                    <div
                      className={`w-10 h-10 shrink-0 rounded-xl flex flex-col justify-center items-center font-black ${isHoliday ? "bg-red-50 text-red-600 border border-red-100" : "bg-blue-50 text-blue-600 border border-blue-100"}`}
                    >
                      <span className={`${ev.endDate && ev.endDate > ev.date ? "text-[9px]" : "text-xs"} leading-none`}>
                        {ev.date}
                        {ev.endDate && ev.endDate > ev.date ? `-${ev.endDate}` : ""}
                      </span>
                      <span className="text-[7px] uppercase tracking-wider leading-none mt-0.5">
                        {ev.monthName.slice(0, 3)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-gray-800 truncate">
                        {ev.name}
                      </p>
                      <p className="text-[9px] font-bold text-gray-400 mt-0.5 uppercase tracking-wider flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5" />
                        {isHoliday ? "Holiday" : ev.type || "Event"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 font-bold text-center py-4">
              No upcoming events listed yet.
            </p>
          )}
        </div>

        {/* INFORMATION DESK */}
        <div className="bg-amber-50/60 border border-amber-100 rounded-3xl p-6 text-xs text-amber-900 leading-relaxed space-y-4">
          <p className="font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5 text-xs">
            <Info className="w-4 h-4 text-amber-600 animate-pulse" /> Interactive Desk Guidelines
          </p>
          <p className="font-semibold text-amber-900/80">
            This academic calendar is synchronized with the standard Bikram Sambat (B.S.) Nepalese year. Use the interactive controls below to plan the academic session.
          </p>

          {/* COLOR CATEGORIES LEDGER */}
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase text-amber-800 tracking-wider">
              🎨 Category Color Legend:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] font-bold">
              <div className="flex items-center gap-1.5 bg-white border border-red-100 rounded-lg p-1.5 px-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-red-700">School Holiday</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white border border-purple-100 rounded-lg p-1.5 px-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
                <span className="text-purple-700">Exam Schedule</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white border border-emerald-100 rounded-lg p-1.5 px-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-emerald-700">Sports / Extracur.</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-lg p-1.5 px-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 shrink-0" />
                <span className="text-amber-800">Festival / Cultural</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white border border-blue-100 rounded-lg p-1.5 px-2.5 sm:col-span-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                <span className="text-blue-700">General School Event</span>
              </div>
            </div>
          </div>

          {isRegisteredUser ? (
            <div className="bg-white border border-amber-200/60 p-3.5 rounded-2xl font-bold text-amber-800 space-y-2">
              <p className="text-[10px] font-black uppercase text-amber-900 flex items-center gap-1">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> Your Workspace Permissions:
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-[10px] text-amber-800/90 font-semibold">
                <li>
                  <span className="font-black text-amber-900">Personal Reminders:</span> Click any date cell inside the Calendar view to instantly add, edit, or delete personal study goals and events.
                </li>
                {isAdmin ? (
                  <li className="text-primary font-black bg-blue-50/50 p-2 rounded-xl border border-blue-100/60 mt-1">
                    ⭐ Central Admin Mode: You have master permission to define school-wide calendar dates.
                  </li>
                ) : (
                  <li>
                    <span className="font-black text-amber-900">User Mode:</span> Your custom saved calendar items are private to your personal dashboard and won't affect other users.
                  </li>
                )}
              </ul>

              <div className="bg-amber-50/50 border border-amber-100 p-2 rounded-xl text-[9px] text-amber-700">
                <span className="font-black block uppercase text-amber-800 mb-0.5">💡 Date Input Note:</span>
                Enter date as a simple number (e.g., <code className="font-mono bg-white px-1 py-0.5 rounded border border-amber-100">5</code>) corresponding to the Nepalese Bikram Sambat month day.
              </div>
            </div>
          ) : (
            <div className="bg-white border border-amber-200/50 p-3 rounded-2xl text-[11px] font-bold text-amber-800">
              🔐 Sign in to your portal to start saving custom exam dates, managing your personal schedule, and customizing your student academic calendar!
            </div>
          )}
        </div>
      </div>

      {/* MAIN ACTIVE CALENDAR CONTAINER (FULL WIDTH) */}
      <div className="w-full flex flex-col gap-6">
          {/* VIEW AND FILTER TOGGLES */}
          <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm flex flex-col xl:flex-row items-center justify-between gap-4">
            {/* Left Side: View Switcher */}
            <div className="flex bg-gray-100 p-1 rounded-2xl w-full xl:w-auto shrink-0">
              <button
                onClick={() => setActiveTab("timeline")}
                className={`flex-1 xl:flex-none px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${activeTab === "timeline" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                <List className="w-4 h-4 text-primary" /> Timeline Planner
              </button>
              <button
                onClick={() => setActiveTab("flipbook")}
                className={`flex-1 xl:flex-none px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${activeTab === "flipbook" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
              >
                <BookOpen className="w-4 h-4 text-primary" /> Tactile Flipbook
              </button>
            </div>

            {/* Middle & Right: Category Filter */}
            <div className="flex flex-wrap items-center justify-center xl:justify-end gap-3 w-full xl:w-auto">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1 shrink-0">
                <Filter className="w-3.5 h-3.5" /> Filter Type:
              </span>

              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {[
                  {
                    id: "all",
                    label: "All",
                    color: "bg-gray-100 text-gray-700 border-gray-200",
                  },
                  {
                    id: "holiday",
                    label: "Holidays 🛑",
                    color: "bg-red-50 text-red-700 border-red-100",
                  },
                  {
                    id: "exam",
                    label: "Exams 📝",
                    color: "bg-purple-50 text-purple-700 border-purple-100",
                  },
                  {
                    id: "sports",
                    label: "Sports 🏆",
                    color: "bg-emerald-50 text-emerald-700 border-emerald-100",
                  },
                  {
                    id: "culture",
                    label: "Cultural 🪔",
                    color: "bg-yellow-50 text-yellow-800 border-yellow-200",
                  },
                  isRegisteredUser && {
                    id: "personal",
                    label: "Personal 🔑",
                    color: "bg-amber-50 text-amber-700 border-amber-100",
                  },
                ]
                  .filter(Boolean)
                  .map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => setFilterType(t.id)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase border transition-all shrink-0 ${filterType === t.id ? `${t.color} ring-2 ring-primary scale-102` : "bg-transparent text-gray-400 border-gray-200 hover:border-gray-400"}`}
                    >
                      {t.label}
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* MAIN ACTIVE VIEWPORT CONTAINER */}
          <div className="w-full">
            {/* TAB 1: MODERN TIMELINE VIEW (CALENDAR GRID + EVENT DETAIL LISTS) */}
            {activeTab === "timeline" && (
              <div className="space-y-6">
                {/* Month Jumper with Navigation */}
                <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm flex items-center justify-between">
                  <button
                    onClick={() => {
                      const cur = parseInt(selectedMonth);
                      if (cur > 0) setSelectedMonth((cur - 1).toString());
                      else setSelectedMonth("11");
                    }}
                    className="p-2.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-xl transition-all"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  <div className="flex flex-col items-center">
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="text-xl font-black text-primary uppercase tracking-widest bg-transparent border-none outline-none cursor-pointer focus:ring-0 text-center"
                    >
                      {monthsData.map((m, idx) => (
                        <option key={idx} value={idx}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-wider">
                      Jump to any specific month
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      const cur = parseInt(selectedMonth);
                      if (cur < 11) setSelectedMonth((cur + 1).toString());
                      else setSelectedMonth("0");
                    }}
                    className="p-2.5 bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-xl transition-all"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {/* Timeline Grid (Current Selected Month Page as full screen card) */}
                {monthsData[parseInt(selectedMonth)] && (
                  <div className="bg-white border border-gray-200/80 rounded-3xl shadow-sm p-4 md:p-6">
                    <CalendarPage
                      month={monthsData[parseInt(selectedMonth)]}
                      monthIndex={parseInt(selectedMonth)}
                      year={selectedYear}
                      todayBsDate={todayBsDate}
                      onDateClick={handleDateClick}
                      filterType={filterType}
                    />
                  </div>
                )}

                {/* Search and Timeline Event Ledger */}
                <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-lg font-black text-gray-900 uppercase tracking-wide">
                        Event Ledger & Search Index
                      </h3>
                      <p className="text-xs text-gray-400 font-bold mt-0.5">
                        Explore schedules and holidays of current academic year
                      </p>
                    </div>

                    <div className="relative w-full md:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search events..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 pl-9 pr-4 py-2 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-primary focus:bg-white"
                      />
                    </div>
                  </div>

                  {activeFilteredList.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto default-scrollbar pr-1">
                      {activeFilteredList.map((e, idx) => {
                        const isHoliday = isHolidayEvent(e);
                        return (
                          <div
                            key={idx}
                            className="bg-gray-50 border border-gray-100 hover:border-gray-200 p-4 rounded-2xl flex items-start gap-3 transition-all relative group"
                          >
                            <div
                              className={`w-11 h-11 shrink-0 rounded-2xl flex flex-col justify-center items-center font-black ${isHoliday ? "bg-red-50 text-red-600 border border-red-100" : "bg-blue-50 text-blue-600 border border-blue-100"}`}
                            >
                              <span className={`${e.endDate && e.endDate > e.date ? "text-[10px]" : "text-sm"} leading-none`}>
                                {e.date}
                                {e.endDate && e.endDate > e.date ? `-${e.endDate}` : ""}
                              </span>
                              <span className="text-[7.5px] uppercase tracking-wider leading-none mt-1">
                                {e.monthName.slice(0, 3)}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-black text-gray-800 break-words">
                                {e.name}
                              </p>
                              <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-wider flex items-center gap-1">
                                <Tag className="w-2.5 h-2.5" />
                                {isHoliday
                                  ? "School Holiday"
                                  : e.type || "Event Schedule"}
                              </p>
                            </div>

                            {isRegisteredUser && (
                              <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() =>
                                    handleDateClick(
                                      e.monthIdx,
                                      e.monthName,
                                      e.date,
                                      e.name,
                                      e,
                                    )
                                  }
                                  className="p-1.5 rounded-lg bg-white border border-gray-100 hover:text-primary text-gray-400 shadow-sm transition-colors"
                                  title="Edit Event"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                {(e.isPersonal || isAdmin) &&
                                  (() => {
                                    const eventKey = `${e.monthIdx}_${e.date}_${e.isPersonal ? "personal" : "school"}`;
                                    const isConfirming =
                                      confirmDeleteKey === eventKey;
                                    return (
                                      <button
                                        onClick={(ev) => {
                                          ev.stopPropagation();
                                          if (isConfirming) {
                                            handleDeleteEvent(
                                              e.monthIdx,
                                              e.date,
                                              !!e.isPersonal,
                                            );
                                            setConfirmDeleteKey(null);
                                          } else {
                                            setConfirmDeleteKey(eventKey);
                                            setTimeout(
                                              () => setConfirmDeleteKey(null),
                                              3500,
                                            );
                                          }
                                        }}
                                        className={`p-1.5 rounded-lg border transition-all duration-200 shadow-sm flex items-center gap-1 text-[9px] font-black uppercase tracking-wider ${
                                          isConfirming
                                            ? "bg-red-600 border-red-600 text-white animate-pulse"
                                            : "bg-white border-gray-100 hover:text-red-600 text-gray-400"
                                        }`}
                                        title={
                                          isConfirming
                                            ? "Confirm Delete?"
                                            : "Delete Event"
                                        }
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        {isConfirming && (
                                          <span className="mr-0.5">
                                            Confirm?
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <CalendarIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-xs font-black text-gray-500 uppercase tracking-widest">
                        No Events Found
                      </p>
                      <p className="text-[11px] text-gray-400 font-medium mt-1">
                        Try adjusting your filters or search keywords.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: TACTILE FLIPBOOK VIEW (Tactile 3D physical-styled book) */}
            {activeTab === "flipbook" && (
              <div className="space-y-6">
                <div className="relative flex items-center justify-center w-full bg-slate-50 p-6 md:p-10 rounded-3xl shadow-inner border border-gray-200/60 overflow-hidden min-h-[480px]">
                  {/* Navigation Buttons for Large Screens */}
                  <button
                    onClick={prevButtonClick}
                    className="hidden md:flex absolute left-4 z-20 w-12 h-12 bg-white rounded-full shadow-lg items-center justify-center text-primary hover:bg-primary hover:text-white transition-all border border-gray-200 active:scale-95"
                  >
                    <ChevronLeft className="w-8 h-8 -mr-1" />
                  </button>

                  <div className="relative flex justify-center items-center drop-shadow-[0_20px_25px_rgba(0,0,0,0.15)] mx-auto perspective-1000 w-full max-w-4xl aspect-[3/4] md:aspect-[8/5.5]">
                    {/* @ts-ignore */}
                    <HTMLFlipBook
                      width={500}
                      height={700}
                      size="stretch"
                      minWidth={280}
                      maxWidth={500}
                      minHeight={450}
                      maxHeight={750}
                      maxShadowOpacity={0.6}
                      showCover={true}
                      mobileScrollSupport={true}
                      clickToChangePages={false}
                      useMouseEvents={false}
                      showPageCorners={false}
                      className="demo-book"
                      onFlip={onFlip}
                      ref={bookRef}
                    >
                      <PageCover>
                        <img
                          src={logoImage}
                          alt="Shikshantar Academy Logo"
                          className="w-28 h-28 mb-4 drop-shadow-2xl bg-white/10 rounded-full p-2 border-4 border-white/20"
                        />
                        <h1 className="text-3xl text-center font-black text-white uppercase tracking-widest leading-tight mb-2 drop-shadow-lg">
                          Shikshantar
                          <br />
                          Academy
                        </h1>
                        <p className="text-blue-200 text-xs tracking-wide font-medium">
                          Karjanhana Municipality, Bastipur-5, Siraha, Nepal
                        </p>

                        <div className="w-full flex items-center justify-center gap-4 my-6">
                          <div className="h-px bg-gradient-to-r from-transparent via-white/50 to-transparent w-full"></div>
                          <div className="w-2 h-2 rotate-45 bg-white shrink-0"></div>
                          <div className="h-px bg-gradient-to-r from-transparent via-white/50 to-transparent w-full"></div>
                        </div>

                        <h2 className="text-xl font-black tracking-[0.4em] text-amber-300 drop-shadow-[0_0_10px_rgba(252,211,77,0.5)] bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent">
                          CALENDAR {selectedYear}
                        </h2>
                        <p className="mt-8 text-blue-300/80 text-[10px] font-black tracking-widest uppercase border border-blue-300/30 px-4 py-2 rounded-full">
                          Use controls below to turn pages
                        </p>
                      </PageCover>

                      {monthsData.map((month, index) => (
                        <CalendarPage
                          key={month.name}
                          month={month}
                          monthIndex={index}
                          year={selectedYear}
                          onDateClick={handleDateClick}
                          todayBsDate={todayBsDate}
                          filterType={filterType}
                        />
                      ))}

                      <PageCover>
                        <img
                          src={logoImage}
                          alt="Logo"
                          className="w-24 h-24 mb-6 opacity-30 grayscale p-2"
                        />
                        <h2 className="text-2xl font-black tracking-widest text-center text-blue-200/60 uppercase">
                          Shikshantar Academy
                          <br />{" "}
                          <span className="text-sm tracking-widest text-blue-300/50 block mt-2">
                            End of Calendar
                          </span>
                        </h2>
                      </PageCover>
                    </HTMLFlipBook>
                  </div>

                  <button
                    onClick={nextButtonClick}
                    className="hidden md:flex absolute right-4 z-20 w-12 h-12 bg-white rounded-full shadow-lg items-center justify-center text-primary hover:bg-primary hover:text-white transition-all border border-gray-200 active:scale-95"
                  >
                    <ChevronRight className="w-8 h-8 -ml-1" />
                  </button>
                </div>

                {/* Navigation Bar for Flipbook */}
                <div className="flex gap-4 w-full justify-between items-center bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
                  <button
                    onClick={prevButtonClick}
                    className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl font-black uppercase tracking-widest text-xs text-gray-700 flex justify-center items-center gap-1 active:scale-95"
                  >
                    <ChevronLeft className="w-5 h-5" /> Prev Month
                  </button>
                  <div className="relative flex-1">
                    <select
                      value={selectedMonth}
                      onChange={handleJumpToMonth}
                      className="w-full text-center text-xs font-black uppercase tracking-widest bg-transparent py-2 border-none outline-none focus:ring-0 cursor-pointer text-primary"
                    >
                      <option value="-1">📖 Front Cover</option>
                      {monthsData.map((m, idx) => (
                        <option key={m.name} value={idx}>
                          {idx + 1}. {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={nextButtonClick}
                    className="flex-1 py-3 bg-primary hover:bg-blue-800 text-white rounded-xl font-black uppercase tracking-widest text-xs flex justify-center items-center gap-1 active:scale-95"
                  >
                    Next Month <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      {/* AT LAST: ADMIN CENTRAL EDIT CONTROL PANEL */}
      {isAdmin && (
        <div className="w-full bg-white rounded-3xl shadow-sm border border-gray-100 p-6 mt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-primary" /> Central Admin Calendar Controls
              </h2>
              <p className="text-xs text-gray-400 font-bold mt-0.5">
                Define master school holidays, exam timetables, and festival events
              </p>
            </div>
            {isEditingExisting && (
              <span className="bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full animate-pulse border border-amber-200">
                ✏️ Editing Existing Event
              </span>
            )}
          </div>

          {adminError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl mb-6 flex items-start gap-2.5 text-xs font-bold">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{adminError}</span>
            </div>
          )}

          <div className="bg-gray-50 border border-gray-200 p-5 rounded-2xl mb-6 grid grid-cols-12 gap-4 items-end">
            <div className="col-span-12 md:col-span-3 w-full">
              <label className="block text-[10px] font-black text-gray-500 uppercase mb-1 tracking-wider">
                Month
              </label>
              <select
                value={adminMonth}
                onChange={(e) => {
                  setAdminError(null);
                  setAdminMonth(e.target.value);
                }}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary text-xs font-bold bg-white"
              >
                {CALENDAR_YEARS[selectedYear].map((m, i) => (
                  <option key={i} value={i}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-6 md:col-span-1 w-full">
              <label className="block text-[10px] font-black text-gray-500 uppercase mb-1 tracking-wider">
                Start Date
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Date"
                value={adminDate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || /^\d*$/.test(val)) {
                    setAdminError(null);
                    setAdminDate(val);
                  }
                }}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary text-xs font-bold bg-white"
              />
            </div>
            <div className="col-span-6 md:col-span-1 w-full">
              <label
                className="block text-[10px] font-black text-gray-500 uppercase mb-1 tracking-wider"
                title="For multi-day events, leave blank for single day"
              >
                End Date
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Opt"
                value={adminEndDate}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || /^\d*$/.test(val)) {
                    setAdminError(null);
                    setAdminEndDate(val);
                  }
                }}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary text-xs font-bold bg-white"
              />
            </div>
            <div className="col-span-12 md:col-span-4 w-full">
              <label className="block text-[10px] font-black text-gray-500 uppercase mb-1 tracking-wider">
                Event Name
              </label>
              <input
                type="text"
                placeholder="E.g. Terminal Exam, Sports Meet"
                value={adminEventName}
                onChange={(e) => {
                  setAdminError(null);
                  setAdminEventName(e.target.value);
                }}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary text-xs font-bold bg-white"
              />
            </div>
            <div className="col-span-12 md:col-span-3 w-full">
              <label className="block text-[10px] font-black text-gray-500 uppercase mb-1 tracking-wider">
                Event Category
              </label>
              <select
                value={adminEventType}
                onChange={(e) => {
                  setAdminError(null);
                  setAdminEventType(e.target.value);
                }}
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary text-xs font-bold bg-white"
              >
                <option value="school holiday">School Holiday (Red)</option>
                <option value="exam">Exam Schedule (Purple)</option>
                <option value="sports">Extracurricular / Sports (Green)</option>
                <option value="culture">Festival / Cultural (Yellow)</option>
                <option value="school function">General Event (Blue)</option>
              </select>
            </div>
            <div className="col-span-12 flex flex-col sm:flex-row justify-end gap-3">
              {(adminDate || adminEventName || adminEndDate) && (
                <button
                  onClick={() => {
                    setAdminDate("");
                    setAdminEndDate("");
                    setAdminEventName("");
                    setAdminEventType("school holiday");
                    setAdminError(null);
                  }}
                  className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer w-full sm:w-auto text-center"
                >
                  Clear Form
                </button>
              )}
              <button
                onClick={handleAdminSave}
                disabled={!adminDate || !adminEventName || isSaving}
                className="px-6 py-3 bg-primary text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-blue-800 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto text-center"
              >
                {isEditingExisting ? (
                  <RefreshCw className="w-4 h-4" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {isSaving
                  ? "Saving..."
                  : isEditingExisting
                    ? "Update Event Schedule"
                    : "Add Event to Schedule"}
              </button>
            </div>
          </div>

          {/* LIST OF OVERRIDDEN / DYNAMIC EVENTS */}
          <h3 className="text-sm font-black text-gray-500 uppercase tracking-wider mb-3">
            Dynamically Saved Calendar Overrides
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {CALENDAR_YEARS[selectedYear].map((m, i) => {
              const monthKey = `month_${i}`;
              const customList = customEventsData[monthKey] || [];
              if (customList.length === 0) return null;

              return (
                <div
                  key={i}
                  className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm"
                >
                  <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                    <span className="font-extrabold text-xs text-gray-800">
                      {m.name}
                    </span>
                    <span className="text-[10px] font-black text-gray-400">
                      Month {i + 1}
                    </span>
                  </div>
                  <ul className="divide-y divide-gray-100 max-h-[180px] overflow-y-auto default-scrollbar">
                    {customList.map((ce: any, idx: number) => (
                      <li
                        key={idx}
                        className="flex justify-between items-center px-4 py-2 hover:bg-gray-50 group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="min-w-[2.25rem] px-1 h-7 rounded-lg bg-blue-50 text-blue-600 flex justify-center items-center font-black text-xs shrink-0 border border-blue-100">
                            {ce.date}
                            {ce.endDate && ce.endDate > ce.date
                              ? `-${ce.endDate}`
                              : ""}
                          </div>
                          <span className="text-xs font-extrabold text-gray-700 truncate">
                            {ce.name || <em>(Deleted)</em>}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleLoadForEdit(i, ce)}
                            className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Edit details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              handleDeleteCustomEvent(i.toString(), ce.date)
                            }
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Delete event"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DATE DETAILS / ADD EDIT REMINDER MODAL */}
      {editModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full relative border border-gray-100">
            <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center justify-between">
              <span>
                {isAdmin ? "🔧 Set School Event" : "🔑 Set Personal Reminder"}
              </span>
              <span className="text-[10px] tracking-wider text-primary font-black bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                {editModal.monthName} {editModal.date}
              </span>
            </h3>

            <div className="flex flex-col gap-3">
              <p className="text-xs text-gray-500 font-medium leading-relaxed">
                {isAdmin
                  ? "Setting an event here defines it as an official school date, visible on everyone's calendar dashboard."
                  : "Setting a reminder here stores a private, key-secured event seen only on your student/teacher portal."}
              </p>

              <div className="h-px bg-gray-100 my-1"></div>

              <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                Event / Reminder Title
              </label>
              <input
                type="text"
                value={editInput}
                onChange={(e) => setEditInput(e.target.value)}
                className="border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-bold text-gray-800 w-full"
                placeholder="E.g. English Term Exam, Homework Due"
                autoFocus
              />

              <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                End Date{" "}
                <span className="text-gray-400 font-medium normal-case">
                  (Optional multi-day range)
                </span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={editEndDateInput}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || /^\d*$/.test(val)) {
                    setEditEndDateInput(val);
                  }
                }}
                className="border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-bold text-gray-800 w-full"
                placeholder="E.g. 18"
              />

              <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                Category Category
              </label>
              <select
                value={editTypeInput}
                onChange={(e) => setEditTypeInput(e.target.value)}
                className="border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-bold text-gray-800 w-full bg-white cursor-pointer"
              >
                <option value="school holiday">School Holiday (Red)</option>
                <option value="exam">Exam Schedule (Purple)</option>
                <option value="sports">Extracurricular / Sports (Green)</option>
                <option value="culture">Festival / Cultural (Yellow)</option>
                <option value="school function">General Event (Blue)</option>
              </select>

              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setEditModal(null)}
                  className="px-4 py-2.5 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors text-xs uppercase"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={saveEvent}
                  disabled={isSaving}
                  className="px-5 py-2.5 font-black text-white bg-primary hover:bg-blue-800 rounded-xl transition-all shadow-md disabled:opacity-50 text-xs uppercase tracking-wider"
                >
                  {isSaving ? "Saving..." : "Save Schedule"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
