import { Injectable } from "@nestjs/common";

@Injectable()
export class ConsoleService {
    constructor() { }

    log(message: string) {
        console.log(message);
    }
}