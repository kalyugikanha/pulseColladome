For June, the numbers are mathematically consistent:

```text
Actual salary pool       ₹2,87,233
Minus unallocated salary ₹92,000
= Project allocated burn ₹1,95,233
```

The ₹92,000 is from people who have salary payable in June but have no project-coded hours logged for June:

| Employee | June payable salary | June project hours | Why unallocated |
|---|---:|---:|---|
| Akash Jangid | ₹40,000 | 0 | No project hours logged |
| Chirag Bansal | ₹30,000 | 0 | No project hours logged |
| Shraddha Saxena | ₹15,000 | 0 | No project hours logged |
| HEMANTH SRIDHAR | ₹7,000 | 0 | ₹10,000 salary minus 9 unpaid leave days |
| Total | ₹92,000 | 0 | Not allocated to any project |

Everyone who did log project hours had their actual payable salary allocated across those projects, totaling ₹1,95,233.

## Proposed UI clarification

I will update the Finance module so this is easier to understand:

1. Rename the current `Total burn` card to `Project allocated burn`.
2. Add/show a clear `Unallocated salary` amount separately.
3. Add a `Total salary burn` card/value showing:

```text
Project allocated burn + Unallocated salary = Actual salary pool
₹1,95,233 + ₹92,000 = ₹2,87,233
```

4. Make the unallocated row/breakdown visible in the Project burn table instead of only being hidden in hover text.