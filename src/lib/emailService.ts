import emailjs from '@emailjs/browser';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * EmailJS Configuration & Dispatcher Service for Shikshantar Academy
 * 
 * Supports sending emails to admin/principal (e.g. info@shikshantar.edu.np, academyshikshantar@gmail.com)
 * when visitors submit Quick Web Enquiries or Admission Forms.
 */

export interface EmailJSConfig {
  serviceId?: string;
  templateId?: string;
  publicKey?: string;
  toEmail?: string;
}

export const getEmailJSConfig = (): EmailJSConfig => {
  const env = (import.meta as any).env || {};
  return {
    serviceId: env.VITE_EMAILJS_SERVICE_ID || 'service_aggvbh8',
    templateId: env.VITE_EMAILJS_TEMPLATE_ID || 'template_4aoqz6f',
    publicKey: env.VITE_EMAILJS_PUBLIC_KEY || 'Z6jGixgTs2V12zdq3D-vo',
    toEmail: env.VITE_ADMIN_EMAIL || 'academyshikshantar@gmail.com',
  };
};

export async function fetchEmailJSConfig(): Promise<EmailJSConfig> {
  const baseConfig = getEmailJSConfig();
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'emailjs'));
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        serviceId: data.serviceId || baseConfig.serviceId || 'service_aggvbh8',
        templateId: data.templateId || baseConfig.templateId || 'template_4aoqz6f',
        publicKey: data.publicKey || baseConfig.publicKey || 'Z6jGixgTs2V12zdq3D-vo',
        toEmail: data.toEmail || baseConfig.toEmail || 'academyshikshantar@gmail.com',
      };
    }
  } catch (e) {
    console.warn('Could not read emailjs config from Firestore, falling back to env:', e);
  }
  return baseConfig;
}

export interface SendEmailResult {
  success: boolean;
  isConfigured: boolean;
  message: string;
  response?: any;
}

/**
 * Send an email notification using EmailJS
 */
export async function sendEmailNotification(
  templateParams: Record<string, any>,
  customConfig?: Partial<EmailJSConfig>
): Promise<SendEmailResult> {
  const fetchedConfig = await fetchEmailJSConfig();
  const config = { ...fetchedConfig, ...customConfig };

  // Check if EmailJS keys are provided
  if (!config.serviceId || !config.templateId || !config.publicKey) {
    console.warn(
      'EmailJS is missing Template ID or Public Key (serviceId: ' + (config.serviceId || 'missing') + ')'
    );
    return {
      success: false,
      isConfigured: false,
      message: 'EmailJS Template ID or Public Key is not configured yet.',
    };
  }

  try {
    const response = await emailjs.send(
      config.serviceId,
      config.templateId,
      {
        to_email: config.toEmail || 'academyshikshantar@gmail.com',
        site_name: 'Shikshantar Academy',
        ...templateParams,
      },
      config.publicKey
    );

    console.log('EmailJS Notification Sent Successfully:', response.status, response.text);
    return {
      success: true,
      isConfigured: true,
      message: 'Email sent successfully via EmailJS!',
      response,
    };
  } catch (error: any) {
    console.error('EmailJS Send Error:', error);
    return {
      success: false,
      isConfigured: true,
      message: error?.text || error?.message || 'Failed to send email via EmailJS.',
    };
  }
}

/**
 * Trigger EmailJS for New Admission Form Submissions
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
    details_summary: JSON.stringify(formData, null, 2),
  };

  return await sendEmailNotification(templateParams);
}

/**
 * Trigger EmailJS for Quick Web Enquiries / Contact Forms
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
 * Trigger EmailJS for Alumni Form Submissions
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

