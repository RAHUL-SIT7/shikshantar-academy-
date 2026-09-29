import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatBSDate, formatBSDateTime } from '../lib/nepaliDate';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, query, orderBy, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { User, Phone, Mail, MapPin, Calendar, Clock, CheckCircle2, XCircle, Trash2, Edit2, Save, X, ArrowUpDown, ArrowUp, ArrowDown, Settings, Plus, Download, FileDown, ExternalLink, ShieldCheck, RefreshCw, AlertCircle, Info, ChevronDown, UserCheck, Eye } from 'lucide-react';
import { exportToExcel } from '../lib/excelExport';
import { exportToPDF } from '../lib/pdfExport';
import { exportAdmissionsToGoogleSheets } from '../lib/googleSheets';
import { googleSignIn, getAccessToken, clearAccessToken } from '../lib/googleAuth';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function AdminAdmissions() {
  const navigate = useNavigate();
  const [admissions, setAdmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [admissionToDelete, setAdmissionToDelete] = useState<{ id: string, name: string } | null>(null);
  const [viewingAdmission, setViewingAdmission] = useState<any | null>(null);
  
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  // Form Config State
  const [formFields, setFormFields] = useState<any[]>([]);

  useEffect(() => {
    let unsubscribeAdmissions = () => {};
    
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeAdmissions();
      
      if (user) {
        // Fetch Admission Data
        const q = query(collection(db, 'admissions'), orderBy('submittedAt', 'desc'));
        unsubscribeAdmissions = onSnapshot(q, (querySnapshot) => {
          const records: any[] = [];
          querySnapshot.forEach((docSnap) => {
            records.push({ id: docSnap.id, ...docSnap.data() });
          });
          setAdmissions(records);
          setLoading(false);
        }, (error) => {
          console.error("Error fetching admissions: ", error);
          setLoading(false);
        });

        // Fetch Config Fields
        const fetchFormConfig = async () => {
          const configDoc = await getDoc(doc(db, 'settings', 'admissionFormConfig'));
          if (configDoc.exists() && configDoc.data().fields) {
            let fetchedFields = configDoc.data().fields;
            fetchedFields = fetchedFields.map((f: any) => {
              if (f.id === 'gradeAppliedFor') {
                  return { ...f, options: ['Play Group', 'Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9'] };
              }
              return f;
            });
            setFormFields(fetchedFields);
          } else {
            setFormFields([
                { id: 'studentName', label: 'Student Full Name', type: 'text', required: true },
                { id: 'dateOfBirth', label: 'Date of Birth', type: 'date', required: true },
                { id: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'], required: true },
                { id: 'parentName', label: 'Parent/Guardian Name', type: 'text', required: true },
                { id: 'contactNumber', label: 'Contact Number', type: 'tel', required: true },
                { id: 'email', label: 'Email Address', type: 'email', required: false },
                { id: 'address', label: 'Residential Address', type: 'textarea', required: true },
                { id: 'gradeAppliedFor', label: 'Grade Applied For', type: 'select', options: ['Play Group', 'Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9'], required: true },
                { id: 'previousSchool', label: 'Previous School Attended (If any)', type: 'text', required: false }
            ]);
          }
        };
        fetchFormConfig();
      } else {
        setAdmissions([]);
        setLoading(false);
      }
    });

    return () => { unsubscribeAdmissions(); unsubAuth(); };
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'admissions', id), {
        status: newStatus
      });
    } catch (error) {
      console.error("Error updating status: ", error);
      alert("Failed to update status.");
    }
  };

  const confirmDelete = async () => {
    if (!admissionToDelete) return;
    try {
      await deleteDoc(doc(db, 'admissions', admissionToDelete.id));
      setAdmissionToDelete(null);
    } catch (error) {
      console.error("Error deleting record: ", error);
      alert("Failed to delete record.");
    }
  };

  const handleEditClick = (admission: any) => {
    setEditingId(admission.id);
    setEditData(admission);
  };

  const handleSaveEdit = async () => {
    try {
      // Exclude metadata from update
      const { id, submittedAt, status, ...updatePayload } = editData;
      await updateDoc(doc(db, 'admissions', editingId!), updatePayload);
      setEditingId(null);
    } catch (error) {
      console.error("Error saving edits: ", error);
      alert("Failed to save changes.");
    }
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedAdmissions = useMemo(() => {
    const sortableData = [...admissions];
    if (sortConfig !== null) {
      sortableData.sort((a, b) => {
        let aValue = a[sortConfig.key] || '';
        let bValue = b[sortConfig.key] || '';

        // Handle Date sorting specifically
        if (sortConfig.key === 'submittedAt') {
          aValue = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : new Date(a.submittedAt).getTime();
          bValue = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : new Date(b.submittedAt).getTime();
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableData;
  }, [admissions, sortConfig]);

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="w-3 h-3 inline-block ml-1 opacity-40 group-hover:opacity-100 transition-opacity" />;
    }
    return sortConfig.direction === 'asc' ? 
      <ArrowUp className="w-3 h-3 inline-block ml-1 text-blue-600" /> : 
      <ArrowDown className="w-3 h-3 inline-block ml-1 text-blue-600" />;
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    // Handle Firestore timestamp
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return formatBSDateTime(date);
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading admissions data...</div>;
  }

  const handleExportExcel = async () => {
    if (admissions.length === 0) {
      alert("No data to export");
      return;
    }

    const columns = formFields.map(f => ({ header: f.label, key: f.id, width: 25 }));
    columns.push({ header: 'Date Submitted', key: 'submittedAt', width: 20 });
    columns.push({ header: 'Status', key: 'status', width: 15 });

    const exportData = admissions.map(adm => {
      const dateRaw = adm.submittedAt ? (adm.submittedAt.toDate ? adm.submittedAt.toDate() : new Date(adm.submittedAt)) : new Date();
      return {
        ...adm,
        submittedAt: formatBSDateTime(dateRaw),
        status: adm.status || 'Pending'
      };
    });

    await exportToExcel('Admission_List', 'Admission List Report', columns, exportData);
  };

  const handleExportPDF = async () => {
    if (admissions.length === 0) {
      alert("No data to export");
      return;
    }

    const head = ['Date', ...formFields.map(f => f.label), 'Status'];

    const body = admissions.map(adm => {
      const dateRaw = adm.submittedAt ? (adm.submittedAt.toDate ? adm.submittedAt.toDate() : new Date(adm.submittedAt)) : null;
      const row = [dateRaw ? formatBSDate(dateRaw) : 'N/A'];
      formFields.forEach(f => {
        row.push(adm[f.id] || '-');
      });
      row.push(adm.status || 'Pending');
      return row;
    });

    await exportToPDF('Admission Applications Report', head, body, `Admission_List_${formatBSDate(new Date())}`, true);
  };

  const handleExportGoogleSheets = async () => {
    if (admissions.length === 0) {
      alert("No data to export");
      return;
    }

    try {
      let token = await getAccessToken();
      if (!token) {
        const result = await googleSignIn();
        if (result) {
          token = result.accessToken;
        } else {
          return; // User cancelled
        }
      }

      setLoading(true);

      const headers = ['Date', ...formFields.map(f => f.label), 'Status'];
      const rows = admissions.map(adm => {
        const dateRaw = adm.submittedAt ? (adm.submittedAt.toDate ? adm.submittedAt.toDate() : new Date(adm.submittedAt)) : new Date();
        const row = [formatBSDateTime(dateRaw)];
        formFields.forEach(f => {
          row.push(adm[f.id] || '-');
        });
        row.push(adm.status || 'Pending');
        return row;
      });

      const url = await exportAdmissionsToGoogleSheets(token, `Admission_List_${formatBSDate(new Date())}`, headers, rows);
      setLoading(false);
      window.open(url, '_blank');
      alert(`Exported successfully! Find your sheet here: ${url}`);
    } catch (err: any) {
      clearAccessToken();
      setLoading(false);
      console.error(err);
      alert('Failed to export to Google Sheets: ' + err.message + '\n\nPlease try again and make sure to check all permission boxes on the Google Sign-in screen.');
    }
  };

  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-[#e5e7eb] w-full max-w-7xl mx-auto min-w-0">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 py-2 border-b border-gray-100 gap-4 w-full min-w-0">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-[#1e293b]">Admission Requests</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Manage and respond to new student applications.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          <div className="bg-slate-50 border border-slate-200 text-primary px-3.5 py-2 flex items-center rounded-xl text-xs sm:text-sm font-bold shadow-sm">
            Total Applications: {admissions.length}
          </div>
          <button 
            onClick={handleExportGoogleSheets}
            className="bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 px-3 py-2 rounded-xl flex items-center gap-2 text-xs sm:text-sm font-bold transition-colors shadow-sm"
            title="Export to Google Sheets"
          >
            <ExternalLink className="w-4 h-4 shrink-0"/> <span>Google Sheets</span>
          </button>
          <button 
            onClick={handleExportPDF}
            className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 px-3 py-2 rounded-xl flex items-center gap-2 text-xs sm:text-sm font-bold transition-colors shadow-sm"
          >
            <FileDown className="w-4 h-4 shrink-0"/> <span>Export to PDF</span>
          </button>
          <button 
            onClick={handleExportExcel}
            className="bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0] hover:bg-[#dcfce7] px-3 py-2 rounded-xl flex items-center gap-2 text-xs sm:text-sm font-bold transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 shrink-0"/> <span>Export to Excel</span>
          </button>
        </div>
      </div>

      {admissions.length === 0 ? (
        <div className="text-center py-12 border-primary text-primary rounded-2xl border border-dashed border-gray-300">
          <User className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">No Admission Requests</h3>
          <p className="text-sm text-gray-500 mt-1">When parents fill out the admission form, it will appear here.</p>
        </div>
      ) : (
        <div className="w-full min-w-0">
          {/* Mobile View: Cards (<sm) */}
          <div className="block sm:hidden divide-y divide-gray-100 w-full">
            {sortedAdmissions.map((admission) => (
              <div key={admission.id} className="p-4 space-y-3 bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-[#1e293b] text-base leading-snug">
                      {admission.studentName || `${admission.studentFirstName || ''} ${admission.studentLastName || ''}`.trim() || '-'}
                    </div>
                    <div className="text-xs font-semibold text-blue-600 mt-0.5">
                      Grade: {admission.gradeAppliedFor || admission.grade || '-'}
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {formatDate(admission.submittedAt)}
                  </div>
                </div>

                <div className="bg-gray-50/80 p-3 rounded-xl space-y-1.5 text-xs text-gray-700">
                  <div className="flex items-center gap-1.5 font-bold text-gray-800">
                    <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span>Parent: {admission.parentName || `${admission.parentFirstName || ''} ${admission.parentLastName || ''}`.trim() || '-'}</span>
                  </div>
                  {admission.contactNumber && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <a href={`tel:${admission.contactNumber}`} className="text-blue-600 font-bold hover:underline">{admission.contactNumber}</a>
                    </div>
                  )}
                  {admission.address && (
                    <div className="flex items-start gap-1.5 text-gray-500">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{admission.address}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex-1 min-w-[120px]">
                    <select 
                      value={admission.status || 'Pending'} 
                      onChange={(e) => handleUpdateStatus(admission.id, e.target.value)}
                      className={`text-xs font-bold px-2 py-1.5 rounded-full border outline-none cursor-pointer w-full text-center ${ admission.status === 'Pending' ? 'bg-yellow-50 text-yellow-800 border-yellow-200' : admission.status === 'Contacted' ? 'bg-blue-50 text-blue-800 border-blue-200' : admission.status === 'Test Scheduled' ? 'bg-purple-50 text-purple-800 border-purple-200' : admission.status === 'Test Conducted' ? 'bg-sky-50 text-sky-800 border-sky-200' : admission.status === 'Admitted' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200' }`}
                    >
                      <option value="Pending">🕒 Pending</option>
                      <option value="Contacted">📞 Contacted</option>
                      <option value="Test Scheduled">📝 Test Scheduled</option>
                      <option value="Test Conducted">🎓 Test Conducted</option>
                      <option value="Admitted">✅ Admitted</option>
                      <option value="Rejected">❌ Rejected</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    {admission.status === 'Admitted' && (
                      <button 
                        onClick={() => navigate('/user-approvals', { state: { prefillAdmission: admission } })}
                        className="p-1.5 text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center justify-center font-bold text-xs shadow-sm"
                        title="Assign as User"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => setViewingAdmission(admission)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 border border-emerald-100 rounded-lg bg-emerald-50/50 transition-colors flex items-center justify-center font-bold text-xs" title="View Details">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleEditClick(admission)} className="p-1.5 text-blue-600 hover:bg-blue-50 border border-blue-100 rounded-lg bg-blue-50/50 transition-colors flex items-center justify-center font-bold text-xs" title="Edit Form">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setAdmissionToDelete({ id: admission.id, name: admission.studentName || 'Unknown Student' })} className="p-1.5 text-red-600 hover:bg-red-50 border border-red-100 rounded-lg bg-red-50/50 transition-colors flex items-center justify-center font-bold text-xs" title="Delete Form">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop/Tablet View: Table (hidden <sm, block sm+) */}
          <div className="hidden sm:block overflow-x-auto custom-scrollbar rounded-xl border border-gray-200 w-full">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead>
                <tr className="text-primary border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-bold select-none bg-gray-50/40">
                  <th className="p-4 cursor-pointer hover:bg-gray-100 group transition-colors" onClick={() => handleSort('submittedAt')}>
                    Date {getSortIcon('submittedAt')}
                  </th>
                  <th className="p-4 cursor-pointer hover:bg-gray-100 group transition-colors" onClick={() => handleSort('studentName')}>
                    Student Info {getSortIcon('studentName')}
                  </th>
                  <th className="p-4 cursor-pointer hover:bg-gray-100 group transition-colors" onClick={() => handleSort('parentName')}>
                    Parent Details {getSortIcon('parentName')}
                  </th>
                  <th className="p-4 cursor-pointer hover:bg-gray-100 group transition-colors" onClick={() => handleSort('status')}>
                    Status {getSortIcon('status')}
                  </th>
                  <th className="p-4">
                    Scholarship
                  </th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {sortedAdmissions.map((admission) => (
                  <React.Fragment key={admission.id}>
                    {editingId === admission.id ? (
                      <tr className="bg-blue-50/40">
                        <td className="p-4 text-xs text-gray-500 whitespace-nowrap align-top">
                          <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(admission.submittedAt)}</div>
                        </td>
                        <td className="p-4 align-top space-y-2" colSpan={4}>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-white p-4 rounded-lg border border-blue-200 shadow-sm">
                            {formFields.map(f => (
                              <div key={f.id}>
                                <label className="text-[0.6rem] uppercase text-gray-500 font-bold block mb-1">{f.label}</label>
                                <input type="text" value={editData[f.id] || ''} onChange={e => setEditData({...editData, [f.id]: e.target.value})} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-blue-500" />
                              </div>
                            ))}
                            {Object.keys(editData).filter(key => !formFields.find(f => f.id === key) && !['id', 'status', 'submittedAt', 'scholarshipStatus'].includes(key)).map(key => (
                              <div key={key}>
                                <label className="text-[0.6rem] uppercase text-gray-500 font-bold block mb-1">{key}</label>
                                <input type="text" value={editData[key] || ''} onChange={e => setEditData({...editData, [key]: e.target.value})} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-blue-500" />
                              </div>
                            ))}
                            <div>
                              <label className="text-[0.6rem] uppercase text-gray-500 font-bold block mb-1">Scholarship Status</label>
                              <select value={editData.scholarshipStatus || 'Not Provided'} onChange={e => setEditData({...editData, scholarshipStatus: e.target.value})} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 outline-none focus:border-blue-500">
                                <option value="Not Provided">Not Provided</option>
                                <option value="Provided">Provided</option>
                              </select>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 align-top border-l border-blue-100 text-center">
                          <div className="flex flex-col gap-2">
                            <button onClick={handleSaveEdit} className="bg-green-600 text-white text-xs font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1 hover:bg-green-700 shadow-sm">
                              <Save className="w-3 h-3" /> Save
                            </button>
                            <button onClick={() => setEditingId(null)} className="bg-gray-200 text-gray-700 text-xs font-bold py-1.5 px-3 rounded flex items-center justify-center gap-1 hover:bg-gray-300 shadow-sm">
                              <X className="w-3 h-3" /> Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr className="hover:text-primary transition-colors group">
                        <td className="p-4 text-xs text-gray-500 whitespace-nowrap align-top">
                          <div className="flex border border-gray-200 bg-white rounded px-2 py-1 w-fit items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(admission.submittedAt)}</div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="font-bold text-[#1e293b] text-base">{admission.studentName || `${admission.studentFirstName || ''} ${admission.studentLastName || ''}`.trim() || '-'}</div>
                          <div className="text-sm font-semibold text-blue-600 mb-1">Grade: {admission.gradeAppliedFor || admission.grade || '-'}</div>
                          <div className="flex items-start gap-1 text-xs text-gray-500 mt-2 max-w-[200px]">
                            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span className="line-clamp-2">{admission.address || '-'}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-3 max-w-[280px] md:max-w-md">
                            {formFields.filter(f => !['studentName', 'studentFirstName', 'studentLastName', 'gradeAppliedFor', 'grade', 'address', 'parentName', 'parentFirstName', 'parentLastName', 'contactNumber', 'email', 'status', 'submittedAt', 'scholarshipStatus'].includes(f.id)).map(f => {
                              const val = admission[f.id];
                              return (
                                <div key={f.id} className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 w-full whitespace-normal break-words" title={val || 'Not provided'}>
                                  <span className="font-bold text-slate-700">{f.label}:</span> <span className="font-medium text-slate-900">{val || '-'}</span>
                                </div>
                              );
                            })}
                            {Object.keys(admission)
                              .filter(key => 
                                !['id', 'status', 'submittedAt', 'scholarshipStatus', 'trackingId', 'studentName', 'studentFirstName', 'studentLastName', 'gradeAppliedFor', 'grade', 'address', 'parentName', 'parentFirstName', 'parentLastName', 'contactNumber', 'email'].includes(key) &&
                                !formFields.find(f => f.id === key) &&
                                admission[key] !== undefined && admission[key] !== null && admission[key] !== ''
                              ).map(key => {
                                const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                return (
                                  <div key={key} className="text-[11px] text-amber-800 bg-amber-50/40 border border-amber-100/50 rounded-lg px-2.5 py-1.5 w-full whitespace-normal break-words" title={admission[key]}>
                                    <span className="font-bold">{label}:</span> <span className="font-medium text-slate-900">{admission[key]}</span>
                                  </div>
                                );
                              })}
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex items-center gap-2 text-sm font-bold text-gray-700 mb-1">
                            <User className="w-4 h-4 text-gray-400" />
                            {admission.parentName || `${admission.parentFirstName || ''} ${admission.parentLastName || ''}`.trim() || '-'}
                          </div>
                          <div className="flex flex-col gap-1 mt-2">
                            <a href={`tel:${admission.contactNumber}`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
                              <Phone className="w-3.5 h-3.5 text-gray-400" /> {admission.contactNumber}
                            </a>
                            {admission.email && (
                              <a 
                                href={`mailto:${admission.email}`} 
                                className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                              >
                                <Mail className="w-3.5 h-3.5 text-gray-400" /> {admission.email}
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <select 
                            value={admission.status || 'Pending'} 
                            onChange={(e) => handleUpdateStatus(admission.id, e.target.value)}
                            className={`text-xs font-bold px-2 py-1.5 rounded-full border outline-none cursor-pointer w-full text-center ${ admission.status === 'Pending' ? 'bg-yellow-50 text-yellow-800 border-yellow-200' : admission.status === 'Contacted' ? 'bg-blue-50 text-blue-800 border-blue-200' : admission.status === 'Test Scheduled' ? 'bg-purple-50 text-purple-800 border-purple-200' : admission.status === 'Test Conducted' ? 'bg-sky-50 text-sky-800 border-sky-200' : admission.status === 'Admitted' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200' }`}
                          >
                            <option value="Pending">🕒 Pending</option>
                            <option value="Contacted">📞 Contacted</option>
                            <option value="Test Scheduled">📝 Test Scheduled</option>
                            <option value="Test Conducted">🎓 Test Conducted</option>
                            <option value="Admitted">✅ Admitted</option>
                            <option value="Rejected">❌ Rejected</option>
                          </select>
                        </td>
                        <td className="p-4 align-top">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${admission.scholarshipStatus === 'Provided' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                            {admission.scholarshipStatus || 'Not Provided'}
                          </span>
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex flex-col gap-1.5 justify-center min-w-[120px]">
                            {admission.status === 'Admitted' && (
                              <button 
                                onClick={() => navigate('/user-approvals', { state: { prefillAdmission: admission } })}
                                className="w-full p-2 text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-colors flex items-center justify-center gap-1 font-black text-xs shadow-sm shadow-emerald-100 hover:shadow"
                                title="Register this admitted student as a user"
                              >
                                <UserCheck className="w-3.5 h-3.5" /> Assign as User
                              </button>
                            )}
                            <div className="flex gap-1">
                              <button onClick={() => setViewingAdmission(admission)} className="flex-1 p-1.5 text-emerald-600 hover:bg-emerald-50 border border-emerald-100 rounded bg-emerald-50/50 transition-colors flex items-center justify-center gap-0.5 font-bold text-xs" title="View Details">
                                <Eye className="w-3.5 h-3.5" /> View
                              </button>
                              <button onClick={() => handleEditClick(admission)} className="flex-1 p-1.5 text-blue-600 hover:bg-blue-50 border border-blue-100 rounded bg-blue-50/50 transition-colors flex items-center justify-center gap-0.5 font-bold text-xs" title="Edit Form">
                                <Edit2 className="w-3 h-3" /> Edit
                              </button>
                              <button onClick={() => setAdmissionToDelete({ id: admission.id, name: admission.studentName || 'Unknown Student' })} className="flex-1 p-1.5 text-red-600 hover:bg-red-50 border border-red-100 rounded bg-red-50/50 transition-colors flex items-center justify-center gap-0.5 font-bold text-xs" title="Delete Form">
                                <Trash2 className="w-3 h-3" /> Del
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {admissionToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="bg-red-50 p-6 flex flex-col items-center border-b border-red-100">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-gray-900 text-center">Delete Admission Record</h3>
              <p className="text-sm font-medium text-gray-600 text-center mt-2">
                Are you sure you want to permanently delete the admission record for <strong>{admissionToDelete.name}</strong>?
              </p>
            </div>
            <div className="p-6 flex flex-col sm:flex-row gap-3">
              <button 
                onClick={() => setAdmissionToDelete(null)}
                className="flex-1 py-3 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 py-3 text-sm font-black text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-sm shadow-red-200"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {viewingAdmission && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200 text-slate-800">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 max-h-[90vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-900 to-[#1B4F72] p-6 text-white flex justify-between items-start">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-2.5 py-1 rounded-full">
                  Tracking ID: {viewingAdmission.trackingId || 'N/A'}
                </span>
                <h3 className="text-2xl font-black mt-2">
                  {viewingAdmission.studentName || `${viewingAdmission.studentFirstName || ''} ${viewingAdmission.studentLastName || ''}`.trim() || 'Student Profile'}
                </h3>
                <p className="text-sm opacity-90 font-medium mt-1">
                  Grade Applied For: <span className="font-bold">{viewingAdmission.gradeAppliedFor || viewingAdmission.grade || 'N/A'}</span>
                </p>
              </div>
              <button 
                onClick={() => setViewingAdmission(null)}
                className="bg-white/10 hover:bg-white/20 text-white rounded-full p-2 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6 text-left">
              {/* Profile Overview */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Date of Birth</div>
                    <div className="text-sm font-bold text-slate-800">{viewingAdmission.dateOfBirth || '-'}</div>
                  </div>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <div className="w-10 h-10 bg-pink-50 text-pink-600 rounded-xl flex items-center justify-center shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Gender</div>
                    <div className="text-sm font-bold text-slate-800">{viewingAdmission.gender || '-'}</div>
                  </div>
                </div>
              </div>

              {/* Parents details */}
              <div className="space-y-3">
                <h4 className="text-xs uppercase tracking-widest font-bold text-[#1B4F72] border-b border-dashed border-slate-200 pb-1.5">
                  Parent / Guardian Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Parent Full Name</div>
                    <div className="text-sm font-semibold text-slate-800 bg-slate-50/50 border border-slate-100/30 rounded-xl px-3 py-2.5">
                      {viewingAdmission.parentName || `${viewingAdmission.parentFirstName || ''} ${viewingAdmission.parentLastName || ''}`.trim() || '-'}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Contact Number</div>
                    <div className="text-sm font-semibold text-slate-800 bg-slate-50/50 border border-slate-100/30 rounded-xl px-3 py-2.5">
                      {viewingAdmission.contactNumber || '-'}
                    </div>
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Email Address</div>
                    <div className="text-sm font-semibold text-slate-800 bg-slate-50/50 border border-slate-100/30 rounded-xl px-3 py-2.5">
                      {viewingAdmission.email || 'Not Provided'}
                    </div>
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Residential Address</div>
                    <div className="text-sm font-semibold text-slate-800 bg-slate-50/50 border border-slate-100/30 rounded-xl px-3 py-2.5 whitespace-pre-line leading-relaxed">
                      {viewingAdmission.address || '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Admission Fields & Extra database values */}
              <div className="space-y-3">
                <h4 className="text-xs uppercase tracking-widest font-bold text-[#1B4F72] border-b border-dashed border-slate-200 pb-1.5">
                  Application Information
                </h4>
                <div className="grid grid-cols-1 gap-3.5">
                  {/* Loop over ALL other fields */}
                  {Object.keys(viewingAdmission)
                    .filter(key => !['id', 'status', 'submittedAt', 'scholarshipStatus', 'trackingId', 'studentName', 'studentFirstName', 'studentLastName', 'gradeAppliedFor', 'grade', 'address', 'parentName', 'parentFirstName', 'parentLastName', 'contactNumber', 'email', 'dateOfBirth', 'gender'].includes(key))
                    .map(key => {
                      const f = formFields.find(field => field.id === key);
                      const label = f ? f.label : key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                      const isExtra = !f;
                      return (
                        <div key={key} className={`flex flex-col gap-1 p-3.5 rounded-2xl border ${isExtra ? 'bg-amber-50/30 border-amber-100/60' : 'bg-slate-50/60 border-slate-100'}`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-[10.5px] font-bold uppercase tracking-wider ${isExtra ? 'text-amber-800' : 'text-slate-400'}`}>
                              {label} {isExtra && <span className="text-[9px] font-extrabold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md ml-1.5 uppercase">Database Field</span>}
                            </span>
                          </div>
                          <span className="text-sm font-bold text-slate-850 whitespace-pre-wrap leading-relaxed mt-1">
                            {viewingAdmission[key] || '-'}
                          </span>
                        </div>
                      );
                    })}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Application Status</div>
                      <div className="text-sm font-bold bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                        {viewingAdmission.status || 'Pending'}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">Scholarship Status</div>
                      <div className="text-sm font-bold bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                        {viewingAdmission.scholarshipStatus || 'Not Provided'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end gap-2.5">
              <button 
                onClick={() => setViewingAdmission(null)}
                className="px-5 py-2.5 text-xs font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-xl transition-all cursor-pointer"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
