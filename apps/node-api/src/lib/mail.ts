import nodemailer from "nodemailer";

interface MailOptions {
    to: string;
    subject: string;
    html: string;
}

export async function sendMail({ to, subject, html }: MailOptions): Promise<void> {
    const email = process.env.email;
    const apppass = process.env.apppass;

    if (!email || !apppass) {
        console.warn("[Mail] Missing email or apppass environment variables. Skipping email dispatch.");
        return;
    }

    try {
        const cleanPass = apppass.replace(/\s+/g, "");
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: email,
                pass: cleanPass,
            },
        });

        await transporter.sendMail({
            from: `"Nexus Platform" <${email}>`,
            to,
            subject,
            html,
        });
        console.log(`[Mail] Email successfully sent to ${to}`);
    } catch (error) {
        console.error(`[Mail] Failed to send email to ${to}:`, error);
    }
}

export function getInviteEmailTemplate(serverName: string, inviteUrl: string): string {
    return `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #ffffff;">
            <h2 style="color: #5865f2; text-align: center;">You've Been Invited to Join ${serverName}!</h2>
            <p>Hello,</p>
            <p>You have been invited to join the secure workspace <strong>${serverName}</strong> on the Nexus platform.</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteUrl}" style="background-color: #5865f2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Accept Invitation</a>
            </div>
            <p style="font-size: 12px; color: #888;">If you cannot click the button above, copy and paste this link in your browser: <br/> <a href="${inviteUrl}">${inviteUrl}</a></p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 11px; color: #aaa; text-align: center;">Nexus Secure Hybrid Communication Platform. End-to-End Encrypted & Decentralized.</p>
        </div>
    `;
}

export function getTamperAlertEmailTemplate(details: Array<{ id: string; content: string; member: string; timestamp: string }>): string {
    const rows = details
        .map(
            (d) => `
            <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 8px; font-size: 12px; font-family: monospace;">${d.id}</td>
                <td style="padding: 8px; font-size: 13px;"><strong>${d.member}</strong></td>
                <td style="padding: 8px; font-size: 13px; color: #d93025; font-family: monospace;">${d.content}</td>
                <td style="padding: 8px; font-size: 12px; color: #666;">${d.timestamp}</td>
            </tr>
        `
        )
        .join("");

    return `
        <div style="font-family: sans-serif; max-width: 800px; margin: auto; padding: 20px; border: 2px solid #d93025; border-radius: 10px; background-color: #ffffff;">
            <h2 style="color: #d93025; text-align: center;">🚨 SECURITY ALERT: Database Tampering Detected!</h2>
            <p>Attention Nexus System Administrator,</p>
            <p>The security watchdog has detected that one or more message records in the database do not match their corresponding cryptographic Proof-of-Work blockchain ledger signatures. This indicates potential database manipulation or an unauthorized entry modification bypass.</p>
            
            <h3 style="color: #333;">Details of Tampered Messages:</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                <thead>
                    <tr style="background-color: #f8f9fa; border-bottom: 2px solid #ddd;">
                        <th style="padding: 8px; text-align: left;">Message ID</th>
                        <th style="padding: 8px; text-align: left;">Sender</th>
                        <th style="padding: 8px; text-align: left;">Modified Content (DB)</th>
                        <th style="padding: 8px; text-align: left;">Created At</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
            
            <p style="margin-top: 25px; font-weight: bold; color: #d93025;">Please audit your database server immediately and check the access logs for unauthorized updates.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 11px; color: #aaa; text-align: center;">Nexus Cryptographic Ledger Auditing System.</p>
        </div>
    `;
}
