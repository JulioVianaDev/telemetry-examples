import { Injectable } from "@nestjs/common";
import { Traceable } from "../traceable.decorator";

@Traceable()
@Injectable()
export class DelayService {
    constructor() { }

    async randomDelay(min: number = 0, max: number = 5000) {
        const ms = Math.floor(Math.random() * (max - min + 1)) + min;
        await this.randomDelay2(min, max);
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async randomDelay2(min: number = 0, max: number = 5000) {
        const ms = Math.floor(Math.random() * (max - min + 1)) + min;
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}