
export const getArrayIntersection = (arr1, arr2) => { 
    const set1 = new Set(arr1)
    const set2 = new Set(arr2)
    const ans = []; 
    for (let i of set2) { 
        if ( !['id', 'ID'].includes(i) && set1.has(i)) { 
            ans.push(i); 
        } 
    } 
    return ans; 
} 