import React, { useState, useEffect } from "react";
import { db } from "../../firebase";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy
} from "firebase/firestore";
import {
  Mail,
  Phone,
  Calendar,
  CheckCircle2,
  XCircle,
  Search,
  Trash2,
  Inbox,
  AlertCircle,
  FileDown
} from "lucide-react";

interface Enquiry {
  id: string;
  name: string;
  studentName?: string;
  grade?: string;
  email?: string;
  phone: string;
  message?: string;
  createdAt?: string;
  status?: "unread" | "resolved" | string;
}

export function EnquiriesTab() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "resolved">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, "contact_enquiries"), orderBy("submittedAt", "desc"));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Enquiry[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...docSnap.data()
          } as Enquiry);
        });
        setEnquiries(list);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching contact enquiries:", error);
        // Fallback without orderBy if index is missing
        onSnapshot(collection(db, "contact_enquiries"), (snap2) => {
          const list: Enquiry[] = [];
          snap2.forEach((docSnap) => {
            list.push({
              id: docSnap.id,
              ...docSnap.data()
            } as Enquiry);
          });
          setEnquiries(list);
          setLoading(false);
        });
      }
    );

    return () => unsubscribe();
  }, []);

  const handleToggleStatus = async (id: string, currentStatus?: string) => {
    try {
      setActionLoading(id);
      const nextStatus = currentStatus === "resolved" ? "unread" : "resolved";
      await updateDoc(doc(db, "contact_enquiries", id), {
        status: nextStatus
      });
      setStatusMsg({ type: "success", text: `Enquiry status updated to ${nextStatus}.` });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: any) {
      console.error("Failed to update status:", err);
      setStatusMsg({ type: "error", text: err?.message || "Failed to update enquiry status." });
      setTimeout(() => setStatusMsg(null), 4000);
    } finally {
      setActionLoading(null);
    }
  };

  const executeDelete = async (id: string) => {
    try {
      setActionLoading(id);
      await deleteDoc(doc(db, "contact_enquiries", id));
      setStatusMsg({ type: "success", text: "Enquiry record deleted successfully!" });
      setDeleteConfirmId(null);
    } catch (err: any) {
      console.error("Failed to delete enquiry:", err);
      setStatusMsg({ type: "error", text: err?.message || "Failed to delete enquiry record." });
    } finally {
      setActionLoading(null);
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  const filteredEnquiries = enquiries.filter((enq) => {
    // Search matching
    const matchesSearch =
      enq.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      enq.phone?.includes(searchQuery) ||
      enq.message?.toLowerCase().includes(searchQuery.toLowerCase());

    // Status matching
    const currentStatus = enq.status || "unread";
    const matchesStatus =
      statusFilter === "all" || currentStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const exportToCSV = () => {
    if (filteredEnquiries.length === 0) return;
    const headers = ["Date", "Name", "Phone Number", "Message", "Status"];
    const rows = filteredEnquiries.map((enq) => [
      enq.createdAt && !isNaN(new Date(enq.createdAt).getTime()) ? new Date(enq.createdAt).toLocaleString() : "N/A",
      enq.name || "",
      enq.phone || "",
      enq.message?.replace(/"/g, '""') || "",
      enq.status || "unread"
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `academic_queries_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
        <p className="text-sm font-semibold">Loading Quick Web Queries...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {statusMsg && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center justify-between shadow-sm transition-all ${
            statusMsg.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
          <button
            onClick={() => setStatusMsg(null)}
            className="text-gray-400 hover:text-gray-600 font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Modal Confirmation for Deleting Inquiry */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-gray-100 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-xl">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-base">
                  Delete Inquiry Record?
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  This action will permanently delete this enquiry from the database.
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 font-bold rounded-xl text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={() => executeDelete(deleteConfirmId)}
                disabled={actionLoading === deleteConfirmId}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {actionLoading === deleteConfirmId ? "Deleting..." : "Yes, Delete Record"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Inbox className="w-5 h-5 text-primary" /> Web Inquiries
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Viewer of queries submitted via the "Register Academic Query" form on the home page.
          </p>
        </div>

        {filteredEnquiries.length > 0 && (
          <button
            onClick={exportToCSV}
            className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-700 transition"
          >
            <FileDown className="w-4 h-4" /> Export CSV
          </button>
        )}
      </div>

      {/* Filter and Search controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Search */}
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, phone, or message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Status Filter */}
        <div className="flex border rounded-lg overflow-hidden bg-white text-xs">
          {(["all", "unread", "resolved"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`flex-1 py-2 font-black uppercase tracking-wider text-center transition-all ${
                statusFilter === status
                  ? "bg-primary text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {filteredEnquiries.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-center border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/50">
          <Mail className="w-12 h-12 text-gray-300 mb-3" />
          <p className="font-bold text-gray-700">No Inquiries Found</p>
          <p className="text-xs text-gray-400 max-w-sm mt-1">
            {searchQuery || statusFilter !== "all"
              ? "Change your search query or clear the status filter to discover more entries."
              : "Students or parents who fill out the short registration form on the school website will appear here in real-time."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredEnquiries.map((enq) => {
            const isResolved = enq.status === "resolved";
            const rawDate = enq.submittedAt || enq.createdAt;
            let dateStr = "Recent";
            if (rawDate) {
              try {
                if (typeof rawDate === 'object' && rawDate !== null && 'toDate' in rawDate && typeof (rawDate as any).toDate === 'function') {
                  dateStr = (rawDate as any).toDate().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
                } else if (typeof rawDate === 'object' && rawDate !== null && 'seconds' in rawDate && typeof (rawDate as any).seconds === 'number') {
                  dateStr = new Date((rawDate as any).seconds * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
                } else {
                  const d = new Date(rawDate);
                  if (!isNaN(d.getTime())) {
                    dateStr = d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
                  }
                }
              } catch (e) {
                dateStr = "Recent";
              }
            }

            return (
              <div
                key={enq.id}
                className={`relative p-5 rounded-xl border transition-all ${
                  isResolved
                    ? "bg-gray-50/40 border-gray-150 opacity-80"
                    : "bg-white border-primary/25 shadow-sm ring-1 ring-primary/5"
                }`}
              >
                {!isResolved && (
                  <div className="absolute top-0 right-12 mt-3 block w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                )}

                <div className="flex justify-between items-start gap-3">
                  <div className="space-y-1.5 flex-1 animate-fade-in">
                    <h4 className="font-display font-medium text-base text-gray-900 border-b border-gray-50 pb-1">
                      {enq.name || "Anonymous Submitter"}
                    </h4>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      <a
                        href={`tel:${enq.phone}`}
                        className="flex items-center gap-1 font-bold text-indigo-600 hover:underline"
                      >
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        {enq.phone}
                      </a>
                      <span className="flex items-center gap-1 text-gray-400">
                        <Calendar className="w-3.5 h-3.5" />
                        {dateStr}
                      </span>
                    </div>

                    {/* New custom fields metadata badge row */}
                    {(enq.studentName || enq.grade || enq.email) && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
                        {enq.studentName && (
                          <span className="inline-flex items-center gap-1 bg-sky-50 dark:bg-sky-950/25 text-sky-800 dark:text-sky-300 px-2 py-0.5 rounded-md font-semibold border border-sky-100 dark:border-sky-900/30">
                            👶 Student: <span className="font-black">{enq.studentName}</span>
                          </span>
                        )}
                        {enq.grade && (
                          <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/25 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-md font-semibold border border-amber-100 dark:border-amber-900/30">
                            🎓 Grade: <span className="font-black">{enq.grade}</span>
                          </span>
                        )}
                        {enq.email && (
                          <span className="inline-flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/25 text-indigo-800 dark:text-indigo-300 px-2 py-0.5 rounded-md font-mono border border-indigo-100 dark:border-indigo-900/30">
                            📧 {enq.email}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <span
                    className={`inline-block text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${
                      isResolved
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-orange-100 text-orange-800"
                    }`}
                  >
                    {isResolved ? "Resolved" : "New Query"}
                  </span>
                </div>

                <div className="mt-4 p-3 bg-gray-50/70 rounded-lg text-sm text-gray-700 leading-relaxed italic border border-gray-100 overflow-hidden break-words">
                  {enq.message || <span className="text-gray-400 italic">No additional message provided.</span>}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between gap-3 text-xs">
                  <button
                    onClick={() => handleToggleStatus(enq.id, enq.status)}
                    disabled={actionLoading === enq.id}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black uppercase tracking-wider text-[10px] transition ${
                      isResolved
                        ? "bg-slate-150 text-slate-700 hover:bg-slate-200"
                        : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {isResolved ? "Mark as New" : "Resolve"}
                  </button>

                  <button
                    onClick={() => setDeleteConfirmId(enq.id)}
                    disabled={actionLoading === enq.id}
                    className="inline-flex items-center gap-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 p-1.5 rounded-lg transition"
                    title="Delete record"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
