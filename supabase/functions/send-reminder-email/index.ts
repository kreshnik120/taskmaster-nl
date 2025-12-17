import { Resend } from "https://esm.sh/resend@4.0.0";
import { handleCors, jsonResponse, errorResponse } from '../_shared/core.ts';
import { getEmailConfig } from '../_shared/healthcare-mappings.ts';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface ReminderEmailRequest {
  to: string;
  reminderTitle: string;
  taskTitle?: string;
  subtaskTitle?: string;
  reminderTime: string;
  taskId: string;
  orgId?: string; // Optional org_id for dynamic branding
}

Deno.serve(async (req: Request): Promise<Response> => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const { to, reminderTitle, taskTitle, subtaskTitle, reminderTime, taskId, orgId }: ReminderEmailRequest = await req.json();

    console.log("📧 Sending reminder email to:", to);

    // 🔧 FASE 4 FIX: Gebruik healthcare-mappings voor correcte email configuratie
    const emailConfig = getEmailConfig(orgId || null);
    console.log("📧 Using email config:", { from: emailConfig.from, replyTo: emailConfig.replyTo, name: emailConfig.name });

    const appUrl = "https://taskmaster-nl.lovable.app";
    const taskUrl = `${appUrl}/kanban/${taskId}`;

    const emailResponse = await resend.emails.send({
      from: `${emailConfig.name} <${emailConfig.from}>`,
      to: [to],
      replyTo: emailConfig.replyTo, // 🔧 FASE 4 FIX: Reply-To toegevoegd
      subject: `Herinnering: ${reminderTitle || taskTitle || "Taak"}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">⏰ Herinnering</h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px 30px;">
                        <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 22px; font-weight: 600;">
                          ${reminderTitle || "Taak Herinnering"}
                        </h2>
                        
                        ${taskTitle ? `
                          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #667eea;">
                            <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Taak</p>
                            <p style="margin: 0; color: #1a1a1a; font-size: 16px; font-weight: 500;">${taskTitle}</p>
                          </div>
                        ` : ''}
                        
                        ${subtaskTitle ? `
                          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #764ba2;">
                            <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Subtaak</p>
                            <p style="margin: 0; color: #1a1a1a; font-size: 16px; font-weight: 500;">${subtaskTitle}</p>
                          </div>
                        ` : ''}
                        
                        <div style="margin: 30px 0;">
                          <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Tijd</p>
                          <p style="margin: 0; color: #1a1a1a; font-size: 16px;">${new Date(reminderTime).toLocaleString('nl-NL', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}</p>
                        </div>
                        
                        <!-- CTA Button -->
                        <div style="text-align: center; margin: 40px 0 20px 0;">
                          <a href="${taskUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);">
                            Open Taak →
                          </a>
                        </div>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: #f8f9fa; padding: 25px 30px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
                          Deze email is verstuurd door <strong>${emailConfig.name}</strong>
                        </p>
                        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                          <a href="${appUrl}" style="color: #667eea; text-decoration: none;">Ga naar TaskMaster</a>
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    console.log("✅ Email sent successfully:", emailResponse);

    return jsonResponse({ success: true, id: emailResponse.data?.id });
  } catch (error: any) {
    console.error("❌ Error sending reminder email:", error);
    return errorResponse(error.message, 500);
  }
});
