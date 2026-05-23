"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
function validate(schema, source = 'body') {
    return (req, _res, next) => {
        const result = schema.safeParse(req[source]);
        if (!result.success) {
            const err = Object.assign(new Error('Invalid request'), {
                statusCode: 400,
                code: 'VALIDATION_ERROR',
                details: result.error.flatten(),
            });
            next(err);
            return;
        }
        // Replace the raw input with the parsed/typed value so downstream handlers
        // see the validated shape. Express types req[source] as their own shapes,
        // so a single targeted cast is necessary here.
        req[source] = result.data;
        next();
    };
}
//# sourceMappingURL=validate.js.map