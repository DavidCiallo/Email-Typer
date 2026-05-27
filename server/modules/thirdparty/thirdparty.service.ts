import { ThirdpartyEntity } from "../../../shared/modules/thirdparty/thirdparty.entity";
import Repository from "../../lib/repository";

const thirdpartyRepository: Repository<ThirdpartyEntity> = Repository.instance("Thirdparty");

export class ThirdpartyService {
    static async findList(config?: { limit?: number; offset?: number }): Promise<{ list: ThirdpartyEntity[]; total: number }> {
        const list = await thirdpartyRepository.find({ delete_time: null }, config);
        const total = await thirdpartyRepository.count();
        return { list, total };
    }

    static async create(data: Partial<ThirdpartyEntity>): Promise<ThirdpartyEntity> {
        return await thirdpartyRepository.insert(data);
    }

    static async update(id: string, data: Partial<ThirdpartyEntity>): Promise<boolean> {
        return await thirdpartyRepository.update({ id } as any, data);
    }

    static async delete(id: string): Promise<boolean> {
        return await thirdpartyRepository.delete({ id } as any);
    }
}
