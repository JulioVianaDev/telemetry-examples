import { Injectable, Logger } from "@nestjs/common";
import { Traceable } from "../traceable.decorator";
import { DelayService } from "./delay.service";

@Traceable()
@Injectable()
export class ConsoleService {
    private readonly logger: Logger = new Logger(ConsoleService.name)
    constructor(private readonly delayService: DelayService,
    ) {
    }

    async log(message: string) {
        await this.delayService.randomDelay();
        this.logger.log(message);
    }
}