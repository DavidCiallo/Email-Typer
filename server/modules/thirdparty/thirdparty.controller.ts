import {
    ThirdpartyListRequest,
    ThirdpartySaveRequest,
    ThirdpartyDeleteRequest,
} from "../../../shared/modules/thirdparty/thirdparty.interface";
import { thirdpartyRoutes } from "../../../shared/modules/thirdparty/thirdparty.router";
import { ThirdpartyService } from "./thirdparty.service";
import { getIdentifyByVerify } from "../auth/auth.service";

async function list(request: ThirdpartyListRequest) {
    request = ThirdpartyListRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";
    const result = await ThirdpartyService.findList({ limit: request.limit, offset: request.offset });
    return result;
}

async function save(request: ThirdpartySaveRequest) {
    request = ThirdpartySaveRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";

    const data = request.thirdparty;

    // Auto-fill login_site from email domain if not provided
    if (!data.login_site) {
        const match = data.email.match(/@(.+)/);
        if (match) {
            data.login_site = "https://mail." + match[1];
        }
    }

    if (request.id) {
        const result = await ThirdpartyService.update(request.id, data);
        if (!result) throw "Record not found";
    } else {
        await ThirdpartyService.create(data);
    }
    return {};
}

async function deleteRecord(request: ThirdpartyDeleteRequest) {
    request = ThirdpartyDeleteRequest.self(request);
    const email = getIdentifyByVerify(request.auth || "");
    if (!email) throw "Unauthorized";
    const result = await ThirdpartyService.delete(request.id);
    if (!result) throw "Record not found";
    return {};
}

export const thirdpartyMount = {
    routes: thirdpartyRoutes,
    handlers: { list, save, delete: deleteRecord },
};
