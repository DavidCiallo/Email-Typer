import { StrategyImpl } from "../../shared/impl";
import { AccountEntity } from "../../shared/types/Account";
import { StrategyEntity } from "../../shared/types/Strategy";
import Repository from "../lib/repository";
import { sendEmail } from "./email.send";

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const strategyRepository = Repository.instance(StrategyEntity);
const accountRepository = Repository.instance(AccountEntity);

export async function getStrategyList(): Promise<StrategyEntity[]> {
    const strategies = await strategyRepository.find();
    const accounts = await accountRepository.find();
    strategies.forEach((item) => {
        item.creater = accounts.find((item2) => item2.email === item.creater)!.name;
    });
    return strategies.reverse();
}

export async function saveStrategy(
    email: string,
    forward: string,
    callback: string,
    comment: string,
    creater: string,
): Promise<boolean> {
    const exist = strategyRepository.findOne({ email, creater });
    if (!forward || forward.length === 0) {
        forward = creater;
    }
    if (exist) {
        strategyRepository.update({ email, creater }, { forward, callback, comment });
    } else {
        strategyRepository.insert({ email, forward, callback, comment, creater });
    }
    const html = `<p>邮箱策略 ${email} 已更新</p><p>该邮箱的所有邮件都将通过本路径向此邮箱转发</p>`;
    sendEmail({ to: forward, subject: "邮箱策略更新", html });
    return true;
}

export async function deleteStrategy(email: string, creater: string): Promise<boolean> {
    const exist = strategyRepository.findOne({ email, creater });
    if (exist) {
        strategyRepository.delete({ email, creater });
    }
    return true;
}
