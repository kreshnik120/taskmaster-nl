import { Resend } from "https://esm.sh/resend@4.0.0";
import { handleCors, createAdminClient, jsonResponse, errorResponse, logInfo, logError } from '../_shared/core.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InviteUserRequest {
  email: string;
  name?: string;
  role?: 'admin' | 'manager' | 'user';
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createAdminClient();
    
    // Get authorization header for user verification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return errorResponse('Niet geautoriseerd', 401);
    }

    // Verify the requesting user is an admin
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      logError('invite-user', 'Auth verification failed', { error: userError });
      return errorResponse('Ongeldige authenticatie', 401);
    }

    // Check if user has admin role
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      logError('invite-user', 'Non-admin attempted to invite', { userId: user.id });
      return errorResponse('Alleen admins kunnen gebruikers uitnodigen', 403);
    }

    // Parse request body
    const body: InviteUserRequest = await req.json();
    const { email, name, role = 'user' } = body;

    if (!email) {
      return errorResponse('E-mailadres is verplicht', 400);
    }

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      return errorResponse('Ongeldig e-mailadres formaat', 400);
    }

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (existingUser) {
      return errorResponse('Dit e-mailadres is al geregistreerd', 409);
    }

    // Check for existing pending invitation
    const { data: existingInvite } = await supabase
      .from('user_invitations')
      .select('id, expires_at, accepted_at')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingInvite) {
      if (existingInvite.accepted_at) {
        return errorResponse('Deze uitnodiging is al geaccepteerd', 409);
      }
      
      const expiresAt = new Date(existingInvite.expires_at);
      if (expiresAt > new Date()) {
        return errorResponse('Er staat al een actieve uitnodiging open voor dit e-mailadres', 409);
      }
      
      // Delete expired invitation to allow re-invite
      await supabase.from('user_invitations').delete().eq('id', existingInvite.id);
    }

    // Create new invitation
    const { data: invitation, error: insertError } = await supabase
      .from('user_invitations')
      .insert({
        email: email.toLowerCase(),
        invited_by: user.id,
        role: role,
      })
      .select('id, token, expires_at')
      .single();

    if (insertError) {
      logError('invite-user', 'Failed to create invitation', { error: insertError });
      return errorResponse('Kon uitnodiging niet aanmaken', 500);
    }

    // Determine base URL for invite link
    const baseUrl = Deno.env.get('SITE_URL') || 'https://taskmaster-nl.lovable.app';
    const inviteLink = `${baseUrl}/auth?invite=${invitation.token}`;

    // Get admin's name for the email
    const adminName = user.user_metadata?.name || user.email?.split('@')[0] || 'Een beheerder';

    // Send invitation email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      logError('invite-user', 'RESEND_API_KEY not configured');
      // Still return success - invitation created, email just not sent
      return jsonResponse({
        success: true,
        invitation_id: invitation.id,
        expires_at: invitation.expires_at,
        email_sent: false,
        warning: 'Uitnodiging aangemaakt, maar e-mail kon niet worden verzonden (RESEND_API_KEY ontbreekt)',
      });
    }

    const resend = new Resend(resendKey);
    
    const roleLabel = role === 'admin' ? 'Administrator' : role === 'manager' ? 'Manager' : 'Medewerker';
    const recipientName = name || email.split('@')[0];
    
    const htmlContent = `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">
                ✉️ Uitnodiging TaskFlow
              </h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px 32px;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Beste ${recipientName},
              </p>
              
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                ${adminName} heeft je uitgenodigd om deel te nemen aan <strong>TaskFlow</strong> als <strong>${roleLabel}</strong>.
              </p>
              
              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 32px 0;">
                Klik op de onderstaande knop om je account aan te maken en aan de slag te gaan:
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${inviteLink}" 
                       style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);">
                      Account Aanmaken →
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Info box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 32px;">
                <tr>
                  <td style="background-color: #f0f9ff; border-radius: 8px; padding: 20px; border-left: 4px solid #3b82f6;">
                    <p style="color: #1e40af; font-size: 14px; margin: 0 0 8px 0; font-weight: 600;">
                      ℹ️ Belangrijk
                    </p>
                    <ul style="color: #1e40af; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.6;">
                      <li>Deze uitnodiging is 7 dagen geldig</li>
                      <li>Je krijgt automatisch de rol "${roleLabel}" toegewezen</li>
                      <li>Gebruik een sterk wachtwoord (minimaal 12 tekens)</li>
                    </ul>
                  </td>
                </tr>
              </table>
              
              <!-- Fallback link -->
              <p style="color: #6b7280; font-size: 12px; line-height: 1.6; margin: 32px 0 0 0; text-align: center;">
                Werkt de knop niet? Kopieer deze link naar je browser:<br>
                <a href="${inviteLink}" style="color: #3b82f6; word-break: break-all;">${inviteLink}</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                Deze e-mail is verzonden via TaskFlow · 
                <a href="${baseUrl}" style="color: #3b82f6; text-decoration: none;">taskmaster-nl.lovable.app</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: 'TaskFlow <noreply@citozorg.nl>',
      to: [email],
      subject: `Uitnodiging: Word lid van TaskFlow als ${roleLabel}`,
      html: htmlContent,
    });

    if (emailError) {
      logError('invite-user', 'Failed to send email', { error: emailError });
      return jsonResponse({
        success: true,
        invitation_id: invitation.id,
        expires_at: invitation.expires_at,
        email_sent: false,
        warning: 'Uitnodiging aangemaakt, maar e-mail kon niet worden verzonden',
      });
    }

    logInfo('invite-user', 'Invitation sent successfully', {
      invitationId: invitation.id,
      email,
      role,
      invitedBy: user.id,
      emailId: emailResult?.id,
    });

    return jsonResponse({
      success: true,
      invitation_id: invitation.id,
      expires_at: invitation.expires_at,
      email_sent: true,
    });

  } catch (error) {
    logError('invite-user', 'Unexpected error', { error: String(error) });
    return errorResponse('Er ging iets mis bij het versturen van de uitnodiging', 500);
  }
});
