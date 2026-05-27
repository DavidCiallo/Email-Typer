import { aesDecrypt, aesEncrypt, hashGenerate } from "../../methods/crypto";
import { AccountEntity } from "../../../shared/modules/account/account.entity";
import Repository from "../../lib/repository";
import { sendEmail, buildVerificationEmail } from "../email/email.service";
import { SettingsService } from "../settings/settings.service";

const accountRepository: Repository<AccountEntity> = Repository.instance("Account");

export async function loginUser(email: string, password: string): Promise<{ token?: string; is_admin?: number; needsVerification?: boolean }> {
    console.log(password)
    password = hashGenerate(password);
    console.log(password)
    const emailItem = await accountRepository.findOne({ email, password });
    if (emailItem) {
        return { token: genTokenForIdentify(email), is_admin: emailItem.is_admin };
    } else {
        return {};
    }
}

function checkAllowedDomain(email: string): string | null {
    const allowedDomains = SettingsService.get("allowed_domains");
    if (!allowedDomains) return null;
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) return "Invalid email format";
    const domains = allowedDomains.split(",").map(d => d.trim().toLowerCase());
    if (!domains.includes(domain)) {
        return `Registration is limited to ${domains.join(", ")} email addresses`;
    }
    return null;
}

/**
 * Step 1: Pre-register — check duplicates and send verification email.
 * Account is NOT created yet.
 */
export async function preRegisterUser(name: string, email: string, password: string): Promise<{ needsVerification?: boolean }> {
    const domainError = checkAllowedDomain(email);
    if (domainError) { throw domainError; }
    const exist = await accountRepository.findIgnoreDelete({ email });
    if (exist) { return {}; }
    const payload = [name, email, password].join("|-|");
    const verificationToken = aesEncrypt(payload);
    const verifyUrl = `${SettingsService.get("client_url")}/verify?token=${encodeURIComponent(verificationToken)}`;
    const emailSent = await sendEmail({
        to: email,
        ...buildVerificationEmail(verifyUrl),
    });
    if (!emailSent) {
        console.error("Failed to send verification email to:", email);
        return {};
    }
    return { needsVerification: true };
}

/**
 * Step 2: Complete registration — decrypt token, create account.
 */
export async function completeRegistration(token: string): Promise<{ account?: AccountEntity } | null> {
    const decrypted = aesDecrypt(token);
    if (!decrypted) return null;
    const parts = decrypted.split("|-|");
    if (parts.length < 3) return null;
    const [name, email, plainPassword] = parts;
    const exist = await accountRepository.findIgnoreDelete({ email });
    if (exist) return null;
    const password = hashGenerate(plainPassword);
    const account = await accountRepository.insert({ name, email, password, is_admin: 0 });
    if (!account) return null;
    return { account };
}

export async function getAccountByEmail(email: string): Promise<AccountEntity | null> {
    return await accountRepository.findOne({ email });
}

export function genTokenForIdentify(identity: string, expried: number = 1000 * 60 * 60 * 24 * 3): string {
    expried = Date.now() + expried;
    const token = [identity, expried.toString()].join("|-|");
    return aesEncrypt(token);
}

export function getIdentifyByVerify(token: string): string | null {
    const dt = aesDecrypt(token);
    if (!dt) return null;
    const [identity, expried] = dt.split("|-|");
    if (Date.now() > Number(expried)) return null;
    return identity;
}

export async function requireAdmin(auth?: string): Promise<void> {
    if (!auth) throw "Authorization failed";
    const email = getIdentifyByVerify(auth);
    if (!email) throw "Authorization failed";
    const account = await getAccountByEmail(email);
    if (!account || !account.is_admin) throw "Permission denied";
}
