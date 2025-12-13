"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LabelAssociationType = {
    Chat: "label_jid",
    Message: "label_message"
};
```

This optimization:
1. Removes the unnecessary IIFE (Immediately Invoked Function Expression)
2. Directly assigns the object to the export
3. Reduces the number of operations needed to access the type values

While this change is small, it reduces the overhead of function calls and object creation, which can contribute to overall performance improvements in type checking operations throughout the application.