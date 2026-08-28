import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatBSDate } from './nepaliDate';

const logoImage = "https://i.postimg.cc/nc9G7pRB/image.png";

export const exportToPDF = async (
    title: string, 
    columns: string[],
    data: any[][],
    filename: string,
    landscape: boolean = false
) => {
    const orientation = landscape ? 'l' : 'p';
    const pdf = new jsPDF(orientation, 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    
    try {
        const response = await fetch(logoImage);
        const blob = await response.blob();
        const base64data = await new Promise((resolve) => {
           const reader = new FileReader();
           reader.onloadend = () => resolve(reader.result);
           reader.readAsDataURL(blob);
        });
        pdf.addImage(base64data as string, 'PNG', 14, 10, 20, 20);
    } catch (err) {
        console.error("Error loading logo for PDF", err);
    }
    
    pdf.setFontSize(22);
    // @ts-ignore
    pdf.setTextColor(220, 38, 38); // Red-600
    pdf.setFont('helvetica', 'bold');
    pdf.text('SHIKSHANTAR ACADEMY', pageWidth / 2, 18, { align: 'center' });
    
    pdf.setFontSize(10);
    // @ts-ignore
    pdf.setTextColor(37, 99, 235); // Blue-600
    pdf.setFont('helvetica', 'bold');
    pdf.text('Karjanhana Municipality, Bastipur-5, Siraha, Nepal | academyshikshantar@gmail.com | +977 9709867048, +977 9807790805', pageWidth / 2, 24, { align: 'center' });

    pdf.setFontSize(14);
    // @ts-ignore
    pdf.setTextColor(0, 0, 0); // Black
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, pageWidth / 2, 34, { align: 'center' });
    
    pdf.setFontSize(9);
    // @ts-ignore
    pdf.setTextColor(100);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Generated on: ${formatBSDate(new Date())}`, 14, 42);

    autoTable(pdf, {
        startY: 46,
        head: [columns],
        body: data,
        theme: 'striped',
        styles: { fontSize: 9, halign: 'center', valign: 'middle' },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [249, 250, 251] }
    });

    pdf.save(`${filename}.pdf`);
};
