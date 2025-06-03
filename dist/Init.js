/**
 * @description: This function initializes a timer based on command line arguments.
 * @param {number} defaultValue - The default value in seconds.
 * @param {Logger} logger - The logger object for logging messages.
 * @returns {number} - The number of seconds to wait before starting the application.
 */
export function initTimer(defaultValue = 1, logger) {
    const args = process.argv.slice(2);
    if (args.length <= 0) {
        logger.log('No command line arguments provided. Defaulting to 1 second.');
        return defaultValue;
    }
    const startIndex = args.indexOf('-s');
    if (startIndex === -1 || args[startIndex + 1] === undefined) {
        logger.log('Startparameter Error. Defaulting to 1 second.');
        return defaultValue;
    }
    const minutes = parseInt(args[startIndex + 1], 10);
    if (!isNaN(minutes) && minutes > 0) {
        return minutes * 60;
    }
    logger.log('Startparameter Error. Invalid number of minutes provided. Defaulting to 1 second.');
    return defaultValue;
}
