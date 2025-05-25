import chalk from "chalk";
import * as fs from "fs";
import { Logger } from "./types";

const ERROR_ICON = '❌';
const INFO_ICON = 'ℹ️';
const WARNING_ICON = '⚠️';


class LoggerService implements Logger {
    LOG_FILE: string;
    
    constructor() {
        this.LOG_FILE = './logfile.log';
    }

    getLocalDate() {
        return new Date().toISOString();
    }

    timeStampMessage(message: string) {
        const timestamp = this.getLocalDate();
        return `[${timestamp}] ${message}`;
    }

    log(message: string) {
        const logMessage = this.timeStampMessage(message);
        console.log(chalk.white(logMessage));
        fs.appendFileSync(this.LOG_FILE, logMessage + '\n');
    }

    error(message: string) {
        const errorMessage = this.timeStampMessage(message);
        console.error(chalk.red(errorMessage));
        fs.appendFileSync(this.LOG_FILE, ERROR_ICON + errorMessage + '\n');
    }

    info(message: string) {
        const infoMessage = this.timeStampMessage(message);
        console.log(chalk.blue(infoMessage));
        fs.appendFileSync(this.LOG_FILE, INFO_ICON + infoMessage + '\n');
    }

    warning(message: string) {
        const warningMessage = this.timeStampMessage(message);
        console.warn(chalk.yellow(warningMessage));
        fs.appendFileSync(this.LOG_FILE, WARNING_ICON + warningMessage + '\n');
    }

    getAllMessages(): string[] {
        if (!fs.existsSync(this.LOG_FILE)) {
            return [];
        }
        const fileContent = fs.readFileSync(this.LOG_FILE, 'utf-8');
        return fileContent.split('\n').filter(line => line.trim() !== '');
    }
}

export default LoggerService;
