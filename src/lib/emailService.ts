import { auth } from '../firebase';

/**
 * Server-Delegated Email & Notification Dispatcher Service for Shikshantar Academy
 * All email credentials (SMTP / EmailJS) are strictly held server-side.
 * No VITE_EMAILJS_* or VITE_SMTP_* secrets are stored or read in client code.
 */

export interface EmailJSConfig {
  serviceId?: string;
  templateId?: string;
  publicKey?: string;
  toEmail?: string;
}

export interface SendEmailResult {
  success: boolean;
  isConfigured: boolean;
  message: string;
  response?: any;
}

export const getEmailJSConfig = (): EmailJSConfig => {
  return {
    toEmail: 'academyshikshantar@gmail.com',
  };
};

export async function fetchEmailJSConfig(): Promise<EmailJSConfig> {
  return getEmailJSConfig();
}

/**
 * Dispatch an email notification strictly through the server API
 */
export async function sendEmailNotification(
  templateParams: Record<string, any>,
  customConfig?: Partial<EmailJSConfig>
): Promise<SendEmailResult> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (auth.currentUser) {
      try {
        const idToken = await auth.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      } catch {}
    }

    const res = await fetch('/api/public/dispatch-email', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        templateParams,
        toEmail: customConfig?.toEmail || templateParams.to_email || 'academyshikshantar@gmail.com',
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        isConfigured: Boolean(data.isConfigured ?? true),
        message: data.error || data.message || 'Failed to dispatch email notification via server.',
      };
    }

    return {
      success: Boolean(data.success),
      isConfigured: Boolean(data.isConfigured ?? true),
      message: data.message || 'Notification processed by server.',
      response: data,
    };
  } catch (error: any) {
    return {
      success: false,
      isConfigured: false,
      message: error?.message || 'Network error while dispatching notification.',
    };
  }
}

/**
 * Trigger Server Email Notification for New Admission Form Submissions
 */
export async function sendAdmissionEmail(formData: Record<string, any>, trackingId: string) {
  const studentName = formData.studentName || formData.fullName || 'New Applicant';
  const parentName = formData.parentName || formData.fatherName || 'N/A';
  const contactNumber = formData.contactNumber || formData.phone || 'N/A';
  const email = formData.email || 'N/A';
  const grade = formData.gradeAppliedFor || formData.grade || 'N/A';
  const address = formData.address || 'N/A';

  const admissionDetailsMessage = `New Admission Application Details:
- Student Name: ${studentName}
- Parent / Guardian Name: ${parentName}
- Grade / Class Applied For: ${grade}
- Contact Phone: ${contactNumber}
- Email: ${email}
- Residential Address: ${address}
- Tracking ID: #${trackingId}`;

  const templateParams = {
    type: 'ADMISSION',
    subject: `[New Admission] Application from ${studentName} (${grade}) - #${trackingId}`,
    title: `New Admission Application from ${studentName}`,
    name: studentName,
    from_name: studentName,
    from_email: email,
    email: email !== 'N/A' ? email : '',
    contact_number: contactNumber,
    phone: contactNumber,
    grade_applied: grade,
    message: admissionDetailsMessage,
    student_name: studentName,
    parent_name: parentName,
    address: address,
    tracking_id: trackingId,
    submission_time: new Date().toLocaleString(),
  };

  return await sendEmailNotification(templateParams);
}

/**
 * Trigger Server Email Notification for Quick Web Enquiries / Contact Forms
 */
export async function sendEnquiryEmail(enquiryData: {
  name: string;
  email?: string;
  phone: string;
  subject?: string;
  message: string;
  grade?: string;
}) {
  const gradeValue = enquiryData.grade || 'General Enquiry';
  const userEmail = enquiryData.email || 'N/A';
  const templateParams = {
    type: 'ENQUIRY',
    subject: `[Web Enquiry] ${enquiryData.subject || 'New Quick Enquiry from ' + enquiryData.name}`,
    title: `Web Enquiry from ${enquiryData.name}`,
    name: enquiryData.name,
    from_name: enquiryData.name,
    from_email: userEmail,
    email: userEmail !== 'N/A' ? userEmail : '',
    contact_number: enquiryData.phone,
    phone: enquiryData.phone,
    grade_applied: gradeValue,
    grade_interested: gradeValue,
    message: enquiryData.message,
    submission_time: new Date().toLocaleString(),
  };

  return await sendEmailNotification(templateParams);
}

/**
 * Trigger Server Email Notification for Alumni Form Submissions
 */
export async function sendAlumniEmail(alumniData: {
  name: string;
  batch: string;
  currentStatus: string;
  organization: string;
  degree?: string;
  category?: string;
  quote?: string;
  email?: string;
  phone?: string;
}) {
  const userEmail = alumniData.email || 'N/A';
  const userPhone = alumniData.phone || 'N/A';
  const alumniMessage = `[Alumni Details]
Batch Year: ${alumniData.batch}
Current Status / Role: ${alumniData.currentStatus}
Organization / Institution: ${alumniData.organization}
Degree / Stream: ${alumniData.degree || 'N/A'}
Sector Category: ${alumniData.category || 'General'}
Reflection / Message: ${alumniData.quote || 'N/A'}`;

  const templateParams = {
    type: 'ALUMNI',
    subject: `[Alumni Record] New Success Story Submission from ${alumniData.name}`,
    title: `Alumni Story Submission from ${alumniData.name}`,
    name: alumniData.name,
    from_name: alumniData.name,
    from_email: userEmail,
    email: userEmail !== 'N/A' ? userEmail : '',
    contact_number: userPhone,
    phone: userPhone,
    grade_applied: `Alumni (Batch ${alumniData.batch})`,
    grade_interested: `Alumni (Batch ${alumniData.batch})`,
    message: alumniMessage,
    submission_time: new Date().toLocaleString(),
  };

  return await sendEmailNotification(templateParams);
}

/**
 * Trigger Server Email Notification for Guardian Result Publication
 */
export async function sendGuardianResultPublicationEmail(params: {
  studentName: string;
  studentId: string;
  guardianName: string;
  guardianEmail: string;
  className: string;
  section: string;
  examName: string;
  academicYear: string;
}): Promise<SendEmailResult> {
  if (!params.guardianEmail || !params.guardianEmail.includes('@')) {
    return {
      success: false,
      isConfigured: true,
      message: `No registered guardian email found for ${params.studentName} (${params.studentId}). Delivery failure recorded safely.`
    };
  }

  const messageText = `Dear ${params.guardianName || 'Parent / Guardian'},

The official academic results for ${params.studentName} (Class ${params.className} Sec ${params.section}, ID: ${params.studentId}) for ${params.examName} (${params.academicYear} BS) have been published.

You can view the full grade sheet and performance summary securely by logging into the Shikshantar Academy Portal.

Best regards,
Academic Administration
Shikshantar Academy, Bastipur, Siraha, Nepal`;

  const templateParams = {
    type: 'GUARDIAN_RESULT',
    subject: `[Official Result Published] ${params.examName} Result for ${params.studentName}`,
    title: `Result Published - ${params.examName}`,
    name: params.guardianName || 'Parent / Guardian',
    from_name: 'Shikshantar Academy Administration',
    from_email: 'academyshikshantar@gmail.com',
    to_email: params.guardianEmail,
    email: params.guardianEmail,
    student_name: params.studentName,
    student_id: params.studentId,
    exam_name: params.examName,
    class_name: params.className,
    section: params.section,
    academic_year: params.academicYear,
    message: messageText,
    submission_time: new Date().toLocaleString()
  };

  return await sendEmailNotification(templateParams, { toEmail: params.guardianEmail });
}
