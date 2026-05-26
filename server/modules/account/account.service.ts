import { hashGenerate } from "../../methods/crypto";
import { AccountEntity } from "../../../shared/modules/account/account.entity";
import Repository from "../../lib/repository";

const accountRepository: Repository<AccountEntity> = Repository.instance("Account");

export class AccountService {
    static async findByEmail(email: string): Promise<AccountEntity | null> {
        return await accountRepository.findOne({ email });
    }

    static async findById(id: string): Promise<AccountEntity | null> {
        return await accountRepository.findOne({ id });
    }

    static async findList(config?: { limit?: number; offset?: number }): Promise<{ list: AccountEntity[]; total: number }> {
        const list = await accountRepository.find({}, config);
        const total = await accountRepository.count();
        return { list, total };
    }

    static async create(data: Partial<AccountEntity>): Promise<AccountEntity> {
        if (data.password) {
            data.password = hashGenerate(data.password);
        }
        return await accountRepository.insert(data);
    }

    static async update(id: string, data: Partial<AccountEntity>): Promise<boolean> {
        if (data.password) {
            data.password = hashGenerate(data.password);
        }
        return await accountRepository.update({ id } as any, data);
    }

    static async delete(id: string): Promise<boolean> {
        return await accountRepository.delete({ id } as any);
    }
}
