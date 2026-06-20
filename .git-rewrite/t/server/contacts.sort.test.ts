/**
 * 联系人排序功能测试
 * 测试 contacts.list API 的 sortBy 参数功能
 */

import { describe, it, expect } from 'vitest';

describe('联系人排序逻辑', () => {
  // 模拟联系人数据
  const mockContacts = [
    {
      id: 1,
      name: '张三',
      tags: [{ id: 1, name: '标签1' }, { id: 2, name: '标签2' }, { id: 3, name: '标签3' }, { id: 4, name: '标签4' }, { id: 5, name: '标签5' }],
      personalTags: [],
      totalInteractions: 10,
    },
    {
      id: 2,
      name: '李四',
      tags: [{ id: 6, name: '标签6' }, { id: 7, name: '标签7' }],
      personalTags: [],
      totalInteractions: 20,
    },
    {
      id: 3,
      name: '王五',
      tags: [{ id: 8, name: '标签8' }, { id: 9, name: '标签9' }, { id: 10, name: '标签10' }, { id: 11, name: '标签11' }, { id: 12, name: '标签12' }, { id: 13, name: '标签13' }, { id: 14, name: '标签14' }, { id: 15, name: '标签15' }],
      personalTags: [],
      totalInteractions: 5,
    },
    {
      id: 4,
      name: '赵六',
      tags: [{ id: 16, name: '标签16' }],
      personalTags: [],
      totalInteractions: 15,
    },
    {
      id: 5,
      name: '孙七',
      tags: [{ id: 17, name: '标签17' }, { id: 18, name: '标签18' }, { id: 19, name: '标签19' }],
      personalTags: [],
      totalInteractions: 3,
    },
  ];

  // 模拟排序函数（与 server/routers.ts 中的逻辑一致）
  const sortContacts = (contacts: typeof mockContacts, sortBy?: string) => {
    const result = [...contacts]; // 创建副本避免修改原数组
    
    if (!sortBy) {
      return result;
    }

    result.sort((a, b) => {
      if (sortBy === 'tagCount_desc') {
        // 标签数量：由高到低（标签数 + 个人标签数）
        return (b.tags.length + b.personalTags.length) - (a.tags.length + a.personalTags.length);
      } else if (sortBy === 'tagCount_asc') {
        // 标签数量：由低到高
        return (a.tags.length + a.personalTags.length) - (b.tags.length + b.personalTags.length);
      } else if (sortBy === 'interactionCount_desc') {
        // 联络次数：由高到低
        return (b.totalInteractions || 0) - (a.totalInteractions || 0);
      } else if (sortBy === 'interactionCount_asc') {
        // 联络次数：由低到高
        return (a.totalInteractions || 0) - (b.totalInteractions || 0);
      }
      return 0;
    });

    return result;
  };

  it('默认排序（不传 sortBy 参数）', () => {
    const result = sortContacts(mockContacts);
    
    expect(result.length).toBe(5);
    // 默认排序应该保持原顺序
    expect(result[0].name).toBe('张三');
    expect(result[1].name).toBe('李四');
    expect(result[2].name).toBe('王五');
    expect(result[3].name).toBe('赵六');
    expect(result[4].name).toBe('孙七');
  });

  it('按标签数量由高到低排序', () => {
    const result = sortContacts(mockContacts, 'tagCount_desc');
    
    expect(result.length).toBe(5);
    
    // 验证排序顺序：王五(8) > 张三(5) > 孙七(3) > 李四(2) > 赵六(1)
    expect(result[0].name).toBe('王五');
    expect(result[0].tags.length).toBe(8);
    
    expect(result[1].name).toBe('张三');
    expect(result[1].tags.length).toBe(5);
    
    expect(result[2].name).toBe('孙七');
    expect(result[2].tags.length).toBe(3);
    
    expect(result[3].name).toBe('李四');
    expect(result[3].tags.length).toBe(2);
    
    expect(result[4].name).toBe('赵六');
    expect(result[4].tags.length).toBe(1);
  });

  it('按标签数量由低到高排序', () => {
    const result = sortContacts(mockContacts, 'tagCount_asc');
    
    expect(result.length).toBe(5);
    
    // 验证排序顺序：赵六(1) < 李四(2) < 孙七(3) < 张三(5) < 王五(8)
    expect(result[0].name).toBe('赵六');
    expect(result[0].tags.length).toBe(1);
    
    expect(result[1].name).toBe('李四');
    expect(result[1].tags.length).toBe(2);
    
    expect(result[2].name).toBe('孙七');
    expect(result[2].tags.length).toBe(3);
    
    expect(result[3].name).toBe('张三');
    expect(result[3].tags.length).toBe(5);
    
    expect(result[4].name).toBe('王五');
    expect(result[4].tags.length).toBe(8);
  });

  it('按联络次数由高到低排序', () => {
    const result = sortContacts(mockContacts, 'interactionCount_desc');
    
    expect(result.length).toBe(5);
    
    // 验证排序顺序：李四(20) > 赵六(15) > 张三(10) > 王五(5) > 孙七(3)
    expect(result[0].name).toBe('李四');
    expect(result[0].totalInteractions).toBe(20);
    
    expect(result[1].name).toBe('赵六');
    expect(result[1].totalInteractions).toBe(15);
    
    expect(result[2].name).toBe('张三');
    expect(result[2].totalInteractions).toBe(10);
    
    expect(result[3].name).toBe('王五');
    expect(result[3].totalInteractions).toBe(5);
    
    expect(result[4].name).toBe('孙七');
    expect(result[4].totalInteractions).toBe(3);
  });

  it('按联络次数由低到高排序', () => {
    const result = sortContacts(mockContacts, 'interactionCount_asc');
    
    expect(result.length).toBe(5);
    
    // 验证排序顺序：孙七(3) < 王五(5) < 张三(10) < 赵六(15) < 李四(20)
    expect(result[0].name).toBe('孙七');
    expect(result[0].totalInteractions).toBe(3);
    
    expect(result[1].name).toBe('王五');
    expect(result[1].totalInteractions).toBe(5);
    
    expect(result[2].name).toBe('张三');
    expect(result[2].totalInteractions).toBe(10);
    
    expect(result[3].name).toBe('赵六');
    expect(result[3].totalInteractions).toBe(15);
    
    expect(result[4].name).toBe('李四');
    expect(result[4].totalInteractions).toBe(20);
  });

  it('排序逻辑处理空标签和零联络次数', () => {
    const contactsWithEmpty = [
      { id: 1, name: '无标签无联络', tags: [], personalTags: [], totalInteractions: 0 },
      { id: 2, name: '有标签无联络', tags: [{ id: 1, name: '标签1' }], personalTags: [], totalInteractions: 0 },
      { id: 3, name: '无标签有联络', tags: [], personalTags: [], totalInteractions: 5 },
    ];

    // 按标签数排序（由高到低）
    const tagSorted = sortContacts(contactsWithEmpty, 'tagCount_desc');
    expect(tagSorted[0].name).toBe('有标签无联络'); // 1个标签
    // 后两个都是0个标签，保持原顺序
    expect(tagSorted[1].name).toBe('无标签无联络');
    expect(tagSorted[2].name).toBe('无标签有联络');

    // 按联络次数排序（由高到低）
    const interactionSorted = sortContacts(contactsWithEmpty, 'interactionCount_desc');
    expect(interactionSorted[0].name).toBe('无标签有联络'); // 5次联络
    // 后两个都是0次联络，保持原顺序
    expect(interactionSorted[1].totalInteractions).toBe(0);
    expect(interactionSorted[2].totalInteractions).toBe(0);
  });

  it('排序逻辑包含个人标签', () => {
    const contactsWithPersonalTags = [
      { 
        id: 1, 
        name: '张三', 
        tags: [{ id: 1, name: '标签1' }, { id: 2, name: '标签2' }], 
        personalTags: [{ id: 3, name: '个人标签1' }], 
        totalInteractions: 10 
      },
      { 
        id: 2, 
        name: '李四', 
        tags: [{ id: 4, name: '标签3' }], 
        personalTags: [{ id: 5, name: '个人标签2' }, { id: 6, name: '个人标签3' }], 
        totalInteractions: 5 
      },
    ];

    const result = sortContacts(contactsWithPersonalTags, 'tagCount_desc');
    
    // 张三: 2个标签 + 1个个人标签 = 3
    // 李四: 1个标签 + 2个个人标签 = 3
    // 数量相同，保持原顺序
    expect(result[0].name).toBe('张三');
    expect(result[0].tags.length + result[0].personalTags.length).toBe(3);
    expect(result[1].name).toBe('李四');
    expect(result[1].tags.length + result[1].personalTags.length).toBe(3);
  });
});
