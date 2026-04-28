import { Injectable } from "@nestjs/common";
import { Traceable } from "../traceable.decorator";
import { DelayService } from "./delay.service";

@Traceable()
@Injectable()
export class ConsoleService {
    constructor(private readonly delayService: DelayService
    ) {
    }

    async log(message: string) {
        await this.delayService.randomDelay();
        console.log(message);
    }
}