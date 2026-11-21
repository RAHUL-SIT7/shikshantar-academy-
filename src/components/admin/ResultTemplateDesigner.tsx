import React, { useState, useEffect } from 'react';
import {
  Layout,
  Type,
  Image as ImageIcon,
  Square,
  Minus,
  Save,
  Eye,
  RotateCcw,
  Sliders,
  Sparkles,
  Award,
  BookOpen,
  Lock,
  Layers,
  Move,
  Trash2,
  Plus,
  History,
  Check,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Crosshair,
  Copy
} from 'lucide-react';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { generatePersonalizedRemark, getSubjectPassMarkDisplay } from '../../lib/personalizedRemarkEngine';

export interface TemplateElement {
  id: string;
  type: 'header' | 'exam_heading' | 'student_info' | 'subject_table' | 'summary_cards' | 'lower_section' | 'footer' | 'text' | 'field' | 'divider';
  label: string;
  fieldToken?: string;
  content?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold' | 'black';
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  textAlign?: 'left' | 'center' | 'right';
  opacity?: number;
  zIndex?: number;
  visible?: boolean;
}

export interface ResultTemplateConfig {
  id: string;
  versionName: string;
  versionNumber: number;
  isActive: boolean;
  updatedAt: string;
  updatedBy: string;
  schoolName: string;
  schoolAddress: string;
  schoolLogoUrl: string;
  headerLogoSize: number; // px width
  headerLogoAlign: 'left' | 'center';
  watermark: {
    enabled: boolean;
    logoUrl: string;
    opacity: number; // 0.02 to 0.30
    size: number; // px width
    positionX: number; // percentage 0 to 100
    positionY: number; // percentage 0 to 100
  };
  typography: {
    primaryFont: string;
    headerFont: string;
    accentColor: string;
    primaryColor: string;
    borderColor: string;
    pinkHeaderBg: string;
  };
  layoutElements: TemplateElement[];
}

export const DEFAULT_SHIKSHANTAR_TEMPLATE: ResultTemplateConfig = {
  id: 'default-shikshantar-v1',
  versionName: 'Shikshantar Official Standard Marksheet',
  versionNumber: 1,
  isActive: true,
  updatedAt: new Date().toISOString(),
  updatedBy: 'System Default',
  schoolName: 'SHIKSHANTAR ACADEMY',
  schoolAddress: 'Bastipur, Karjanha-05, Siraha, Nepal',
  schoolLogoUrl: '/logo.png',
  headerLogoSize: 96,
  headerLogoAlign: 'left',
  watermark: {
    enabled: true,
    logoUrl: '/logo.png',
    opacity: 0.08,
    size: 450,
    positionX: 50,
    positionY: 50
  },
  typography: {
    primaryFont: 'sans-serif',
    headerFont: 'sans-serif',
    accentColor: '#1a2b4c',
    primaryColor: '#1a2b4c',
    borderColor: '#1a2b4c',
    pinkHeaderBg: '#f0a4c2'
  },
  layoutElements: [
    {
      id: 'el-header',
      type: 'header',
      label: 'School Branding & Badge Header',
      visible: true
    },
    {
      id: 'el-exam-heading',
      type: 'exam_heading',
      label: 'Examination Name Heading Box',
      visible: true
    },
    {
      id: 'el-student-info',
      type: 'student_info',
      label: 'Student Identity Box (Name, Reg, Roll, ID)',
      visible: true
    },
    {
      id: 'el-subject-table',
      type: 'subject_table',
      label: 'Subject Marks Table (Pink Header)',
      visible: true
    },
    {
      id: 'el-summary-cards',
      type: 'summary_cards',
      label: '4 Performance Summary Cards',
      visible: true
    },
    {
      id: 'el-lower-section',
      type: 'lower_section',
      label: 'Traits & Behavioral + Performance Grade Table',
      visible: true
    },
    {
      id: 'el-footer-signatures',
      type: 'footer',
      label: 'Signatures & Date Strip',
      visible: true
    }
  ]
};

// Sample student data for live template preview
const SAMPLE_PREVIEW_STUDENT = {
  studentName: 'Aarav Sharma',
  class: '10-A',
  rollNo: '04',
  registrationNo: 'SA-REG-2083-1042',
  studentId: 'STU-10042',
  academicYear: '2083–2084 B.S.',
  examType: 'First Terminal Examination',
  totalMarks: 500,
  percentage: 83.33,
  gpa: 3.65,
  grade: 'A',
  rank: '2',
  subjects: {
    'Mathematics': { fullMarks: 100, thMarks: 88, prMarks: '-', obtained: 88 },
    'Science': { fullMarks: 100, thMarks: 58, prMarks: 23, obtained: 81 },
    'English': { fullMarks: 100, thMarks: 56, prMarks: 22, obtained: 78 },
    'Nepali': { fullMarks: 100, thMarks: 60, prMarks: 20, obtained: 80 },
    'Social Studies': { fullMarks: 100, thMarks: 62, prMarks: 21, obtained: 83 },
    'Computer': { fullMarks: 100, thMarks: 48, prMarks: 42, obtained: 90 }
  }
};

export function ResultTemplateDesigner({ setStatus, userRole }: { setStatus: (s: any) => void; userRole: string }) {
  const [template, setTemplate] = useState<ResultTemplateConfig>(DEFAULT_SHIKSHANTAR_TEMPLATE);
  const [selectedElementId, setSelectedElementId] = useState<string | null>('el-header');
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Load Active Template on mount
  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const tDoc = await getDoc(doc(db, 'settings', 'result_template'));
        if (tDoc.exists()) {
          const loadedData = tDoc.data() as ResultTemplateConfig;
          // Ensure structure compatibility
          setTemplate({
            ...DEFAULT_SHIKSHANTAR_TEMPLATE,
            ...loadedData,
            watermark: {
              ...DEFAULT_SHIKSHANTAR_TEMPLATE.watermark,
              ...(loadedData.watermark || {})
            },
            typography: {
              ...DEFAULT_SHIKSHANTAR_TEMPLATE.typography,
              ...(loadedData.typography || {})
            }
          });
        }
      } catch (e) {
        console.warn('Failed to load active result template from Firestore:', e);
      }
    };
    fetchTemplate();
  }, []);

  // Fetch Version History
  const fetchHistory = async () => {
    try {
      const qSnap = await getDocs(query(collection(db, 'template_versions'), orderBy('updatedAt', 'desc'), limit(10)));
      const list: any[] = [];
      qSnap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setHistoryList(list);
      setShowHistoryModal(true);
    } catch (e) {
      console.warn('Failed to load template version history:', e);
    }
  };

  const selectedElement = template.layoutElements.find(el => el.id === selectedElementId);

  // Update field on selected element
  const updateSelectedElement = (field: keyof TemplateElement, value: any) => {
    if (!selectedElementId) return;
    setTemplate(prev => ({
      ...prev,
      layoutElements: prev.layoutElements.map(el =>
        el.id === selectedElementId ? { ...el, [field]: value } : el
      )
    }));
  };

  // Add new element to canvas
  const handleAddElement = (type: TemplateElement['type']) => {
    const newId = `el-${type}-${Date.now().toString().slice(-4)}`;
    const newEl: TemplateElement = {
      id: newId,
      type,
      label: `Custom ${type.toUpperCase()} Element`,
      content: type === 'text' ? 'Custom Text Element' : type === 'field' ? '{studentName}' : '',
      fontSize: 12,
      fontWeight: 'bold',
      color: template.typography.primaryColor,
      visible: true
    };
    setTemplate(prev => ({
      ...prev,
      layoutElements: [...prev.layoutElements, newEl]
    }));
    setSelectedElementId(newId);
  };

  // Duplicate element
  const handleDuplicateElement = (id: string) => {
    const target = template.layoutElements.find(el => el.id === id);
    if (!target) return;
    const newId = `el-${target.type}-${Date.now().toString().slice(-4)}`;
    const copyEl: TemplateElement = {
      ...target,
      id: newId,
      label: `${target.label} (Copy)`
    };
    setTemplate(prev => ({
      ...prev,
      layoutElements: [...prev.layoutElements, copyEl]
    }));
    setSelectedElementId(newId);
  };

  // Remove element
  const handleRemoveElement = (id: string) => {
    setTemplate(prev => ({
      ...prev,
      layoutElements: prev.layoutElements.filter(el => el.id !== id)
    }));
    if (selectedElementId === id) setSelectedElementId(null);
  };

  // Preset watermark positioning
  const applyWatermarkPreset = (preset: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => {
    let posX = 50;
    let posY = 50;
    if (preset === 'top-left') { posX = 25; posY = 25; }
    else if (preset === 'top-right') { posX = 75; posY = 25; }
    else if (preset === 'bottom-left') { posX = 25; posY = 75; }
    else if (preset === 'bottom-right') { posX = 75; posY = 75; }

    setTemplate(prev => ({
      ...prev,
      watermark: {
        ...prev.watermark,
        positionX: posX,
        positionY: posY
      }
    }));
  };

  // Save Draft to Firestore
  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const updatedTemplate = {
        ...template,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.displayName || (userRole === 'admin' ? 'Admin' : 'Teacher')
      };

      await setDoc(doc(db, 'settings', 'result_template_draft'), updatedTemplate);
      
      // Save version snapshot
      await addDoc(collection(db, 'template_versions'), {
        ...updatedTemplate,
        isDraft: true,
        versionName: `Draft v${updatedTemplate.versionNumber} (${new Date().toLocaleTimeString()})`
      });

      setStatus({ type: 'success', message: 'Template draft saved successfully!' });
    } catch (e: any) {
      setStatus({ type: 'error', message: 'Failed to save template draft: ' + e.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Activate Template as Authoritative Official Template
  const handleActivateTemplate = async () => {
    setIsActivating(true);
    try {
      const nextVersionNum = (template.versionNumber || 1) + 1;
      const activeTemplate = {
        ...template,
        versionNumber: nextVersionNum,
        versionName: `v${nextVersionNum}.0 Official Template`,
        isActive: true,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.displayName || (userRole === 'admin' ? 'Admin' : 'Teacher')
      };

      // Set authoritative settings document
      await setDoc(doc(db, 'settings', 'result_template'), activeTemplate);

      // Record version history safely
      try {
        await addDoc(collection(db, 'template_versions'), {
          ...activeTemplate,
          isDraft: false
        });
      } catch (verErr) {
        console.warn('Could not record template version history:', verErr);
      }

      setTemplate(activeTemplate);
      setStatus({ type: 'success', message: `Activated ${activeTemplate.versionName}! All report cards will now use this active template.` });
    } catch (e: any) {
      setStatus({ type: 'error', message: 'Failed to activate template: ' + (e.message || String(e)) });
    } finally {
      setIsActivating(false);
    }
  };

  // Restore Default Shikshantar Marksheet
  const handleRestoreDefault = () => {
    if (window.confirm('Restore official Shikshantar Academy default marksheet template? Any custom visual modifications will be reset.')) {
      setTemplate(DEFAULT_SHIKSHANTAR_TEMPLATE);
      setSelectedElementId('el-header');
      setStatus({ type: 'success', message: 'Restored official Shikshantar Academy marksheet template.' });
    }
  };

  // Evaluate dynamic field tokens for preview safely
  const evaluateFieldToken = (tokenStr?: string) => {
    if (!tokenStr) return '';
    let res = tokenStr;
    const s = SAMPLE_PREVIEW_STUDENT;

    // Safe automated remark evaluation using personalizedRemarkEngine
    const remarkObj = generatePersonalizedRemark({
      studentName: s.studentName,
      class: s.class,
      percentage: s.percentage,
      grade: s.grade,
      subjects: s.subjects
    });

    const remarkAny: any = remarkObj;
    const remarkText = remarkAny?.fullText || remarkAny?.formattedText || remarkAny?.text || 'Demonstrates exceptional diligence and consistent academic performance across all subject areas.';

    res = res.replace('{studentName}', s.studentName || '');
    res = res.replace('{class}', s.class || '');
    res = res.replace('{rollNo}', s.rollNo || '');
    res = res.replace('{registrationNo}', s.registrationNo || '');
    res = res.replace('{studentId}', s.studentId || '');
    res = res.replace('{academicYear}', s.academicYear || '');
    res = res.replace('{examType}', s.examType || '');
    res = res.replace('{totalMarks}', String(s.totalMarks || 0));
    res = res.replace('{percentage}', `${s.percentage || 0}%`);
    res = res.replace('{gpa}', (s.gpa || 0).toFixed(2));
    res = res.replace('{grade}', s.grade || '');
    res = res.replace('{rank}', `#${s.rank || '-'}`);
    res = res.replace('{schoolName}', template.schoolName || 'SHIKSHANTAR ACADEMY');
    res = res.replace('{schoolAddress}', template.schoolAddress || '');
    res = res.replace('{automatedRemarks}', remarkText);

    return res;
  };

  // Render Selection Handles Box around active canvas element
  const renderSelectionHandles = () => (
    <>
      <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-purple-600 rounded-full border-2 border-white shadow-md z-30 pointer-events-none" />
      <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-purple-600 rounded-full border-2 border-white shadow-md z-30 pointer-events-none" />
      <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-purple-600 rounded-full border-2 border-white shadow-md z-30 pointer-events-none" />
      <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-purple-600 rounded-full border-2 border-white shadow-md z-30 pointer-events-none" />
    </>
  );

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar Bar */}
      <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <Layout className="w-6 h-6 text-purple-600" />
              Admin Result Template Designer
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
              {template.versionName || 'Active Template'}
            </span>
          </div>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Visual editor for Shikshantar Academy report cards. Configure watermark, headers, student card layout, Pink subject marks header, and remarks.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsPreviewActive(!isPreviewActive)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              isPreviewActive ? 'bg-purple-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Eye className="w-4 h-4" />
            {isPreviewActive ? 'Exit Live Preview' : 'Live Preview Mode'}
          </button>

          <button
            onClick={fetchHistory}
            className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <History className="w-4 h-4" />
            Version History
          </button>

          <button
            onClick={handleRestoreDefault}
            className="px-3.5 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Restore Default
          </button>

          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Save Draft
          </button>

          <button
            onClick={handleActivateTemplate}
            disabled={isActivating}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-md transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            Activate Template
          </button>
        </div>
      </div>

      {/* 2. Main Designer Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side Controls / Property Inspector (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Add & Manage Elements Panel */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-purple-600" /> Add Custom Elements
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAddElement('text')}
                className="p-2.5 bg-gray-50 hover:bg-purple-50 hover:border-purple-200 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-2 transition-colors text-left"
              >
                <Type className="w-4 h-4 text-purple-600" />
                Text Block
              </button>
              <button
                onClick={() => handleAddElement('field')}
                className="p-2.5 bg-gray-50 hover:bg-purple-50 hover:border-purple-200 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-2 transition-colors text-left"
              >
                <BookOpen className="w-4 h-4 text-blue-600" />
                Dynamic Field
              </button>
              <button
                onClick={() => handleAddElement('divider')}
                className="p-2.5 bg-gray-50 hover:bg-purple-50 hover:border-purple-200 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 flex items-center gap-2 transition-colors text-left"
              >
                <Minus className="w-4 h-4 text-amber-600" />
                Hairline Divider
              </button>
            </div>
          </div>

          {/* School Branding & Header Logo Controls */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-purple-600" /> School Header & Logo
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">School Name</label>
                <input
                  type="text"
                  value={template.schoolName}
                  onChange={e => setTemplate(prev => ({ ...prev, schoolName: e.target.value }))}
                  className="w-full px-3 py-1.5 border rounded-xl font-black text-gray-900 bg-gray-50 focus:bg-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">School Address & Sub-header</label>
                <input
                  type="text"
                  value={template.schoolAddress}
                  onChange={e => setTemplate(prev => ({ ...prev, schoolAddress: e.target.value }))}
                  className="w-full px-3 py-1.5 border rounded-xl font-bold text-gray-700 bg-gray-50 focus:bg-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Header Logo URL</label>
                  <input
                    type="text"
                    value={template.schoolLogoUrl}
                    onChange={e => setTemplate(prev => ({ ...prev, schoolLogoUrl: e.target.value }))}
                    className="w-full px-3 py-1.5 border rounded-xl font-mono text-[11px] bg-gray-50 focus:bg-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Header Logo Size ({template.headerLogoSize || 96}px)</label>
                  <input
                    type="range"
                    min="48"
                    max="140"
                    step="4"
                    value={template.headerLogoSize || 96}
                    onChange={e => setTemplate(prev => ({ ...prev, headerLogoSize: parseInt(e.target.value, 10) }))}
                    className="w-full accent-purple-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Watermark Controls */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-purple-600" /> Marksheet Watermark Controls
              </h3>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-purple-700">
                <input
                  type="checkbox"
                  checked={template.watermark.enabled}
                  onChange={e =>
                    setTemplate(prev => ({
                      ...prev,
                      watermark: { ...prev.watermark, enabled: e.target.checked }
                    }))
                  }
                  className="w-4 h-4 text-purple-600 rounded accent-purple-600"
                />
                Enable
              </label>
            </div>

            {template.watermark.enabled && (
              <div className="space-y-3 pt-2 border-t border-gray-100 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Watermark Logo Image Path / URL</label>
                  <input
                    type="text"
                    value={template.watermark.logoUrl}
                    onChange={e =>
                      setTemplate(prev => ({
                        ...prev,
                        watermark: { ...prev.watermark, logoUrl: e.target.value }
                      }))
                    }
                    className="w-full px-3 py-1.5 border rounded-xl font-mono text-[11px] bg-gray-50 focus:bg-white outline-none"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-gray-600 font-bold mb-1">
                    <span>Opacity:</span>
                    <span className="font-mono">{Math.round(template.watermark.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.02"
                    max="0.30"
                    step="0.01"
                    value={template.watermark.opacity}
                    onChange={e =>
                      setTemplate(prev => ({
                        ...prev,
                        watermark: { ...prev.watermark, opacity: parseFloat(e.target.value) }
                      }))
                    }
                    className="w-full accent-purple-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-gray-600 font-bold mb-1">
                    <span>Size (px Width):</span>
                    <span className="font-mono">{template.watermark.size}px</span>
                  </div>
                  <input
                    type="range"
                    min="200"
                    max="700"
                    step="10"
                    value={template.watermark.size}
                    onChange={e =>
                      setTemplate(prev => ({
                        ...prev,
                        watermark: { ...prev.watermark, size: parseInt(e.target.value, 10) }
                      }))
                    }
                    className="w-full accent-purple-600"
                  />
                </div>

                {/* X / Y Position Sliders */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-600 font-bold mb-1">
                      <span>Position X (%):</span>
                      <span className="font-mono">{template.watermark.positionX || 50}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      step="1"
                      value={template.watermark.positionX || 50}
                      onChange={e =>
                        setTemplate(prev => ({
                          ...prev,
                          watermark: { ...prev.watermark, positionX: parseInt(e.target.value, 10) }
                        }))
                      }
                      className="w-full accent-purple-600"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-600 font-bold mb-1">
                      <span>Position Y (%):</span>
                      <span className="font-mono">{template.watermark.positionY || 50}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="90"
                      step="1"
                      value={template.watermark.positionY || 50}
                      onChange={e =>
                        setTemplate(prev => ({
                          ...prev,
                          watermark: { ...prev.watermark, positionY: parseInt(e.target.value, 10) }
                        }))
                      }
                      className="w-full accent-purple-600"
                    />
                  </div>
                </div>

                {/* Positioning Presets */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 mb-1 flex items-center gap-1">
                    <Crosshair className="w-3.5 h-3.5 text-purple-600" /> Positioning Presets
                  </label>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => applyWatermarkPreset('center')}
                      className="px-2 py-1 text-[10px] font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg border border-purple-200"
                    >
                      Center
                    </button>
                    <button
                      type="button"
                      onClick={() => applyWatermarkPreset('top-left')}
                      className="px-2 py-1 text-[10px] font-bold bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border"
                    >
                      Top-Left
                    </button>
                    <button
                      type="button"
                      onClick={() => applyWatermarkPreset('top-right')}
                      className="px-2 py-1 text-[10px] font-bold bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border"
                    >
                      Top-Right
                    </button>
                    <button
                      type="button"
                      onClick={() => applyWatermarkPreset('bottom-left')}
                      className="px-2 py-1 text-[10px] font-bold bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border"
                    >
                      Bottom-Left
                    </button>
                    <button
                      type="button"
                      onClick={() => applyWatermarkPreset('bottom-right')}
                      className="px-2 py-1 text-[10px] font-bold bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg border"
                    >
                      Bottom-Right
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Selected Element Property Inspector */}
          {selectedElement ? (
            <div className="bg-white p-5 rounded-2xl border border-purple-200 shadow-sm space-y-4 relative">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <h3 className="text-xs font-black uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-purple-600" /> Inspector: {selectedElement.label}
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDuplicateElement(selectedElement.id)}
                    className="p-1 text-gray-400 hover:text-purple-600 transition-colors"
                    title="Duplicate Element"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  {!['el-header', 'el-subject-table', 'el-footer-signatures'].includes(selectedElement.id) && (
                    <button
                      onClick={() => handleRemoveElement(selectedElement.id)}
                      className="p-1 text-gray-400 hover:text-rose-600 transition-colors"
                      title="Delete Element"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3 text-xs">
                {/* Element Label */}
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Element Label</label>
                  <input
                    type="text"
                    value={selectedElement.label}
                    onChange={e => updateSelectedElement('label', e.target.value)}
                    className="w-full px-3 py-1.5 border rounded-xl font-bold bg-gray-50 focus:bg-white outline-none"
                  />
                </div>

                {/* Visibility Toggle */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-bold text-gray-600">Show on Marksheet</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedElement.visible !== false}
                      onChange={e => updateSelectedElement('visible', e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded accent-purple-600"
                    />
                    <span className="text-[11px] font-bold text-gray-700">Visible</span>
                  </label>
                </div>

                {/* Custom Text / Field Token */}
                {selectedElement.type === 'field' && (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1">
                      Field Token Expression
                    </label>
                    <input
                      type="text"
                      value={selectedElement.fieldToken || ''}
                      onChange={e => updateSelectedElement('fieldToken', e.target.value)}
                      placeholder="{studentName}, {gpa}, {rank}, {automatedRemarks}"
                      className="w-full px-3 py-1.5 border rounded-xl font-mono text-[11px] font-bold bg-gray-50 focus:bg-white outline-none"
                    />
                  </div>
                )}

                {selectedElement.type === 'text' && (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 mb-1">Static Text Content</label>
                    <textarea
                      value={selectedElement.content || ''}
                      onChange={e => updateSelectedElement('content', e.target.value)}
                      className="w-full px-3 py-1.5 border rounded-xl font-bold bg-gray-50 focus:bg-white outline-none h-20 text-xs"
                    />
                  </div>
                )}

                {/* Font Size & Weight */}
                {['text', 'field'].includes(selectedElement.type) && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Font Size (px)</label>
                      <input
                        type="number"
                        value={selectedElement.fontSize || 12}
                        onChange={e => updateSelectedElement('fontSize', parseInt(e.target.value, 10) || 12)}
                        className="w-full px-2 py-1 border rounded-lg font-mono font-bold text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Font Weight</label>
                      <select
                        value={selectedElement.fontWeight || 'bold'}
                        onChange={e => updateSelectedElement('fontWeight', e.target.value)}
                        className="w-full px-2 py-1 border rounded-lg font-bold text-xs"
                      >
                        <option value="normal">Normal (400)</option>
                        <option value="bold">Bold (700)</option>
                        <option value="black">Black (900)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 p-6 rounded-2xl border border-dashed border-gray-300 text-center text-xs text-gray-500 font-bold">
              Click any element or section on the marksheet canvas to select and inspect its properties.
            </div>
          )}
        </div>

        {/* Right Side Live Canvas (8 Cols) */}
        <div className="lg:col-span-8">
          <div className="bg-slate-900 p-6 rounded-2xl shadow-xl border border-slate-800 flex justify-center overflow-x-auto">
            {/* A4 Sheet Canvas Container */}
            <div
              className="bg-white w-[210mm] min-h-[297mm] p-6 shadow-2xl relative flex flex-col font-sans text-gray-900 box-border overflow-hidden select-none"
              style={{
                borderColor: template.typography.borderColor
              }}
            >
              {/* Double Navy Border Frame */}
              <div className="border-[3px] border-[#1a2b4c] rounded-sm flex-1 flex flex-col p-1 relative z-0 box-border h-full">
                <div className="border border-[#1a2b4c] rounded-sm flex-1 flex flex-col relative z-0 box-border p-5">
                  {/* Watermark Image Layer */}
                  {template.watermark.enabled && (
                    <div
                      className="absolute pointer-events-none z-0 transform -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left: `${template.watermark.positionX || 50}%`,
                        top: `${template.watermark.positionY || 50}%`,
                        opacity: template.watermark.opacity
                      }}
                    >
                      <img
                        src={template.watermark.logoUrl}
                        alt="Watermark"
                        style={{
                          width: `${template.watermark.size}px`
                        }}
                        className="object-contain"
                      />
                    </div>
                  )}

                  {/* Render Canvas Sections */}
                  <div className="relative z-10 flex-1 space-y-4 flex flex-col">
                    {/* A. Header Section */}
                    {template.layoutElements.find(e => e.id === 'el-header')?.visible !== false && (
                      <div
                        onClick={() => setSelectedElementId('el-header')}
                        className={`relative cursor-pointer p-3 rounded-lg transition-all border-2 ${
                          selectedElementId === 'el-header'
                            ? 'border-purple-600 ring-2 ring-purple-600 bg-purple-50/20'
                            : 'border-transparent hover:border-purple-300 hover:ring-1 hover:ring-purple-300'
                        }`}
                      >
                        {selectedElementId === 'el-header' && renderSelectionHandles()}
                        <div className="flex flex-row justify-between items-center pb-3 border-b-2 border-[#1a2b4c]">
                          <img
                            src={template.schoolLogoUrl}
                            alt="Logo"
                            style={{ width: `${template.headerLogoSize || 96}px`, height: `${template.headerLogoSize || 96}px` }}
                            className="object-contain"
                          />
                          <div className="text-center flex-1 pr-10">
                            <h1 className="text-3xl font-black text-[#1a2b4c] uppercase tracking-wider mb-1">
                              {template.schoolName}
                            </h1>
                            <h2 className="text-xs font-bold text-gray-600 tracking-widest uppercase mb-1">
                              {template.schoolAddress}
                            </h2>
                            <div className="inline-block mt-2 bg-[#1a2b4c] text-white px-5 py-1 rounded-full shadow-sm">
                              <span className="text-[11px] uppercase tracking-[0.2em] font-bold">
                                Academic Progress Report
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* B. Exam Heading */}
                    {template.layoutElements.find(e => e.id === 'el-exam-heading')?.visible !== false && (
                      <div
                        onClick={() => setSelectedElementId('el-exam-heading')}
                        className={`relative cursor-pointer p-2 rounded-lg transition-all border-2 text-center ${
                          selectedElementId === 'el-exam-heading'
                            ? 'border-purple-600 ring-2 ring-purple-600 bg-purple-50/20'
                            : 'border-transparent hover:border-purple-300'
                        }`}
                      >
                        {selectedElementId === 'el-exam-heading' && renderSelectionHandles()}
                        <div className="font-black text-base text-[#1a2b4c] uppercase tracking-widest py-1.5 border border-blue-100 rounded bg-blue-50/30">
                          {SAMPLE_PREVIEW_STUDENT.examType} - {SAMPLE_PREVIEW_STUDENT.academicYear}
                        </div>
                      </div>
                    )}

                    {/* C. Student Info Panel (Structured 2-column) */}
                    {template.layoutElements.find(e => e.id === 'el-student-info')?.visible !== false && (
                      <div
                        onClick={() => setSelectedElementId('el-student-info')}
                        className={`relative cursor-pointer p-1 rounded-lg transition-all border-2 ${
                          selectedElementId === 'el-student-info'
                            ? 'border-purple-600 ring-2 ring-purple-600 bg-purple-50/20'
                            : 'border-transparent hover:border-purple-300'
                        }`}
                      >
                        {selectedElementId === 'el-student-info' && renderSelectionHandles()}
                        <div className="border-[#1a2b4c] border rounded-lg p-3 grid grid-cols-2 gap-y-2 text-xs font-bold uppercase tracking-wide bg-white/80">
                          <div className="border-r border-[#1a2b4c]/10 pr-2">
                            Name: <span className="font-bold text-[#1a2b4c] ml-2 text-sm normal-case">{SAMPLE_PREVIEW_STUDENT.studentName}</span>
                          </div>
                          <div className="pl-4">
                            Class: <span className="font-bold text-[#1a2b4c] ml-2">{SAMPLE_PREVIEW_STUDENT.class}</span>
                          </div>
                          <div className="border-r border-[#1a2b4c]/10 pr-2 pt-2 border-t border-[#1a2b4c]/10">
                            Regd No: <span className="font-bold text-[#1a2b4c] ml-2">{SAMPLE_PREVIEW_STUDENT.registrationNo}</span>
                          </div>
                          <div className="pl-4 pt-2 border-t border-[#1a2b4c]/10">
                            Roll No: <span className="font-bold text-[#1a2b4c] ml-2">{SAMPLE_PREVIEW_STUDENT.rollNo}</span>
                          </div>
                          <div className="col-span-2 pt-2 border-t border-[#1a2b4c]/10 text-gray-600 text-[11px]">
                            Student ID: <span className="font-bold text-[#1a2b4c] ml-2 font-mono">{SAMPLE_PREVIEW_STUDENT.studentId}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* D. Subject Marks Table (Pink Header) */}
                    {template.layoutElements.find(e => e.id === 'el-subject-table')?.visible !== false && (
                      <div
                        onClick={() => setSelectedElementId('el-subject-table')}
                        className={`relative cursor-pointer p-1 rounded-lg transition-all border-2 ${
                          selectedElementId === 'el-subject-table'
                            ? 'border-purple-600 ring-2 ring-purple-600 bg-purple-50/20'
                            : 'border-transparent hover:border-purple-300'
                        }`}
                      >
                        {selectedElementId === 'el-subject-table' && renderSelectionHandles()}
                        <div className="border border-[#1a2b4c] overflow-hidden rounded-none">
                          <table className="w-full border-collapse text-[11px] text-[#1a2b4c]">
                            <thead style={{ backgroundColor: template.typography.pinkHeaderBg }}>
                              <tr>
                                <th className="border border-[#1a2b4c] p-1.5 w-8 text-center" rowSpan={2}>S.N.</th>
                                <th className="border border-[#1a2b4c] p-1.5 text-left" rowSpan={2}>Subject</th>
                                <th className="border border-[#1a2b4c] p-1.5 w-16 text-center" rowSpan={2}>Full Mark</th>
                                <th className="border border-[#1a2b4c] p-1.5 w-16 text-center" rowSpan={2}>Pass Mark</th>
                                <th className="border border-[#1a2b4c] p-1 text-center" colSpan={2}>Marked Obtained</th>
                              </tr>
                              <tr>
                                <th className="border border-[#1a2b4c] p-1 w-16 text-center font-normal text-[10px]">Theory</th>
                                <th className="border border-[#1a2b4c] p-1 w-16 text-center font-normal text-[10px]">Practical</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white/80">
                              {Object.entries(SAMPLE_PREVIEW_STUDENT.subjects).map(([sub, data], i) => (
                                <tr key={sub}>
                                  <td className="border border-[#1a2b4c]/50 p-1 text-center">{i + 1}.</td>
                                  <td className="border border-[#1a2b4c]/50 p-1 font-bold">{sub}</td>
                                  <td className="border border-[#1a2b4c]/50 p-1 text-center text-[10px]">{data.fullMarks}</td>
                                  <td className="border border-[#1a2b4c]/50 p-1 text-center text-[10px]">40</td>
                                  <td className="border border-[#1a2b4c]/50 p-1 text-center font-bold">{data.thMarks}</td>
                                  <td className="border border-[#1a2b4c]/50 p-1 text-center font-bold text-gray-600">{data.prMarks}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* E. 4 Performance Summary Cards */}
                    {template.layoutElements.find(e => e.id === 'el-summary-cards')?.visible !== false && (
                      <div
                        onClick={() => setSelectedElementId('el-summary-cards')}
                        className={`relative cursor-pointer p-1 rounded-lg transition-all border-2 ${
                          selectedElementId === 'el-summary-cards'
                            ? 'border-purple-600 ring-2 ring-purple-600 bg-purple-50/20'
                            : 'border-transparent hover:border-purple-300'
                        }`}
                      >
                        {selectedElementId === 'el-summary-cards' && renderSelectionHandles()}
                        <div className="grid grid-cols-4 gap-3">
                          <div className="border border-[#1a2b4c] rounded-lg p-2 text-center bg-white/90 shadow-sm">
                            <p className="text-gray-500 text-[9px] font-black uppercase tracking-widest mb-0.5">Total Marks</p>
                            <p className="text-base font-black text-[#1a2b4c]">{SAMPLE_PREVIEW_STUDENT.totalMarks}</p>
                          </div>
                          <div className="border border-[#1a2b4c] rounded-lg p-2 text-center bg-white/90 shadow-sm">
                            <p className="text-gray-500 text-[9px] font-black uppercase tracking-widest mb-0.5">Percentage</p>
                            <p className="text-base font-black text-[#1a2b4c]">{SAMPLE_PREVIEW_STUDENT.percentage}%</p>
                          </div>
                          <div className="border border-[#1a2b4c] rounded-lg p-2 text-center bg-white/90 shadow-sm">
                            <p className="text-gray-500 text-[9px] font-black uppercase tracking-widest mb-0.5">Rank</p>
                            <p className="text-base font-black text-[#1a2b4c]">#{SAMPLE_PREVIEW_STUDENT.rank}</p>
                          </div>
                          <div className="border border-[#1a2b4c] rounded-lg p-2 text-center bg-white/90 shadow-sm">
                            <p className="text-gray-500 text-[9px] font-black uppercase tracking-widest mb-0.5">Final Grade</p>
                            <p className="text-base font-black text-[#1a2b4c]">{SAMPLE_PREVIEW_STUDENT.grade}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* F. Lower Section: Traits & Performance Grade Table */}
                    {template.layoutElements.find(e => e.id === 'el-lower-section')?.visible !== false && (
                      <div
                        onClick={() => setSelectedElementId('el-lower-section')}
                        className={`relative cursor-pointer p-1 rounded-lg transition-all border-2 ${
                          selectedElementId === 'el-lower-section'
                            ? 'border-purple-600 ring-2 ring-purple-600 bg-purple-50/20'
                            : 'border-transparent hover:border-purple-300'
                        }`}
                      >
                        {selectedElementId === 'el-lower-section' && renderSelectionHandles()}
                        <div className="flex gap-3">
                          {/* Left: Behavioral Traits + Remarks */}
                          <div className="border border-gray-300 rounded-lg overflow-hidden flex-[0.45] flex flex-col bg-white">
                            <div className="px-3 py-1.5 bg-[#1a2b4c] text-white">
                              <h3 className="text-[10px] font-black uppercase tracking-widest">Traits & Behavioral</h3>
                            </div>
                            <div className="p-2.5 flex flex-col justify-between flex-1 text-[10px] space-y-1.5">
                              <div className="space-y-1">
                                <div className="flex justify-between border-b pb-0.5"><span className="font-bold">i. CONDUCT</span><span className="font-black">A</span></div>
                                <div className="flex justify-between border-b pb-0.5"><span className="font-bold">ii. DISCIPLINE</span><span className="font-black">A</span></div>
                                <div className="flex justify-between border-b pb-0.5"><span className="font-bold">iii. NEATNESS</span><span className="font-black">A</span></div>
                                <div className="flex justify-between border-b pb-0.5"><span className="font-bold">iv. STUDIES</span><span className="font-black">A</span></div>
                              </div>
                              <div className="pt-2 border-t border-gray-200">
                                <p className="font-bold text-[#1a2b4c] leading-tight">
                                  <span className="italic mr-1">Remarks:</span>
                                  {evaluateFieldToken('{automatedRemarks}')}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Right: Performance Grade mapping table */}
                          <div className="border border-[#1a2b4c] rounded-lg overflow-hidden flex-[0.55] flex flex-col bg-white">
                            <table className="w-full text-left text-[9px] border-collapse">
                              <thead className="bg-[#1a2b4c] text-white font-bold">
                                <tr>
                                  <th className="px-2 py-1 uppercase">Performance</th>
                                  <th className="px-2 py-1 uppercase text-center">Grade</th>
                                  <th className="px-2 py-1 uppercase text-center">Percentage</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 font-bold text-[#1a2b4c]">
                                {[
                                  ['Outstanding', 'A+', '90% & above'],
                                  ['Excellent', 'A', '80% to 89%'],
                                  ['Very good', 'B+', '70% to 79%'],
                                  ['Good', 'B', '60% to 69%'],
                                  ['Satisfactory', 'C+', '50% to 59%'],
                                  ['Acceptable', 'C', '40% to 49%'],
                                  ['Basic', 'D', '35% to 39%'],
                                  ['Non-Graded', 'NG', 'Below 35%']
                                ].map((row, i) => (
                                  <tr key={i}>
                                    <td className="px-2 py-0.5">{row[0]}</td>
                                    <td className="px-2 py-0.5 text-center font-black">{row[1]}</td>
                                    <td className="px-2 py-0.5 text-center text-gray-500">{row[2]}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Render Custom Dynamic Text/Field elements added by user */}
                    {template.layoutElements
                      .filter(el => !['el-header', 'el-exam-heading', 'el-student-info', 'el-subject-table', 'el-summary-cards', 'el-lower-section', 'el-footer-signatures'].includes(el.id) && el.visible !== false)
                      .map(el => {
                        const isSelected = selectedElementId === el.id;
                        return (
                          <div
                            key={el.id}
                            onClick={() => setSelectedElementId(el.id)}
                            className={`relative cursor-pointer p-2 rounded transition-all border-2 ${
                              isSelected
                                ? 'border-purple-600 ring-2 ring-purple-600 bg-purple-50/20'
                                : 'border-transparent hover:border-purple-300'
                            }`}
                          >
                            {isSelected && renderSelectionHandles()}
                            <div
                              style={{
                                fontSize: `${el.fontSize || 12}px`,
                                fontWeight: el.fontWeight === 'black' ? 900 : el.fontWeight === 'bold' ? 700 : 400,
                                color: el.color || '#1a2b4c',
                                textAlign: el.textAlign || 'left'
                              }}
                            >
                              {el.type === 'field' ? evaluateFieldToken(el.fieldToken) : el.content}
                            </div>
                          </div>
                        );
                      })}

                    {/* Spacer */}
                    <div className="flex-1 min-h-[16px]" />

                    {/* G. Footer Signatures Strip */}
                    {template.layoutElements.find(e => e.id === 'el-footer-signatures')?.visible !== false && (
                      <div
                        onClick={() => setSelectedElementId('el-footer-signatures')}
                        className={`relative cursor-pointer p-3 rounded-lg transition-all border-2 ${
                          selectedElementId === 'el-footer-signatures'
                            ? 'border-purple-600 ring-2 ring-purple-600 bg-purple-50/20'
                            : 'border-transparent hover:border-purple-300'
                        }`}
                      >
                        {selectedElementId === 'el-footer-signatures' && renderSelectionHandles()}
                        <div className="flex justify-between items-end px-4 pt-4 border-t border-gray-200">
                          <div className="text-center">
                            <div className="text-[10px] font-bold text-gray-500">2083/08/15</div>
                            <div className="w-28 border-b-2 border-[#1a2b4c] my-1" />
                            <div className="text-[9px] font-black uppercase text-[#1a2b4c]">Date</div>
                          </div>
                          <div className="text-center">
                            <div className="w-28 border-b-2 border-[#1a2b4c] my-1 mt-4" />
                            <div className="text-[9px] font-black uppercase text-[#1a2b4c]">Class Teacher</div>
                          </div>
                          <div className="text-center">
                            <div className="w-28 border-b-2 border-[#1a2b4c] my-1 mt-4" />
                            <div className="text-[9px] font-black uppercase text-[#1a2b4c]">Principal Stamp</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Version History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg p-6 space-y-4">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <History className="w-5 h-5 text-purple-600" />
              Template Version History & Rollback
            </h3>
            <p className="text-xs text-gray-500 font-medium">
              Inspect historical draft and active template snapshots. Click any snapshot to restore its design configuration.
            </p>

            <div className="max-h-64 overflow-y-auto space-y-2">
              {historyList.map(item => (
                <div
                  key={item.id}
                  className="p-3 bg-gray-50 border rounded-xl flex items-center justify-between hover:bg-purple-50 hover:border-purple-200 transition-colors"
                >
                  <div>
                    <span className="font-bold text-xs text-gray-900 block">{item.versionName || item.id}</span>
                    <span className="text-[10px] text-gray-500 font-mono">
                      Saved by {item.updatedBy || 'Admin'} • {new Date(item.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setTemplate(item as ResultTemplateConfig);
                      setShowHistoryModal(false);
                      setStatus({ type: 'success', message: `Restored template snapshot: ${item.versionName || item.id}` });
                    }}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg shadow-sm"
                  >
                    Restore
                  </button>
                </div>
              ))}
              {historyList.length === 0 && (
                <p className="text-xs text-gray-400 font-bold text-center py-4">No previous template snapshots saved yet.</p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 border rounded-xl font-bold text-xs text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
