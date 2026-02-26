import { useCommunityStore } from '@/stores/communityStore';
import { useAuthStore } from '@/stores/authStore';
import { Avatar } from '@/components/common/Avatar';
import type { CommunityMember } from '@/types';

export function RightSidebar() {
  const activeCommunityId = useCommunityStore((s) => s.activeCommunityId);
  const communities = useCommunityStore((s) => s.communities);
  const members = useCommunityStore((s) => s.members);
  const currentUser = useAuthStore((s) => s.user);

  const community = communities.find((c) => c.id === activeCommunityId);
  const communityMembers: CommunityMember[] = activeCommunityId ? (members[activeCommunityId] ?? []) : [];

  const ownerAndAdmins = communityMembers.filter((m) => {
    if (m.user_id === community?.owner_id) return true;
    return (m.roles ?? []).some((r) => r.permissions & 1); // PermAdmin
  });
  const regularMembers = communityMembers.filter((m) => !ownerAndAdmins.some((a) => a.user_id === m.user_id));

  if (!community) return null;

  return (
    <aside
      className="glass-panel"
      style={{ width: 260, flexShrink: 0 }}
    >
      {/* Community banner */}
      <div
        style={{
          height: 80,
          background: community.banner_url
            ? `url(${community.banner_url}) center/cover`
            : 'linear-gradient(135deg, var(--on-primary), var(--primary))',
          opacity: 0.8,
          flexShrink: 0,
        }}
      />

      {/* Community info */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          flexShrink: 0,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 16 }}>{community.name}</div>
        <div style={{ fontSize: 11, color: 'var(--outline)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, background: 'var(--success)', borderRadius: '50%' }} />
          {communityMembers.length} участников
        </div>
        {community.description && (
          <div style={{ fontSize: 12, color: 'var(--outline)', marginTop: 8, lineHeight: 1.5 }}>
            {community.description}
          </div>
        )}
      </div>

      {/* Members list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {ownerAndAdmins.length > 0 && (
          <>
            <SectionLabel>Администрация</SectionLabel>
            {ownerAndAdmins.map((m) => (
              <MemberItem key={m.user_id} member={m} isOwner={m.user_id === community.owner_id} />
            ))}
          </>
        )}

        {regularMembers.length > 0 && (
          <>
            <SectionLabel>Участники — {regularMembers.length}</SectionLabel>
            {regularMembers.map((m) => (
              <MemberItem key={m.user_id} member={m} />
            ))}
          </>
        )}

        {communityMembers.length === 0 && (
          <div style={{ padding: 16, color: 'var(--outline)', fontSize: 13, textAlign: 'center' }}>
            <span className="icon" style={{ fontSize: 32, opacity: 0.3, display: 'block', marginBottom: 8 }}>group</span>
            Нет участников
          </div>
        )}
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '12px 16px 6px',
        fontSize: 10,
        color: 'var(--outline)',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '1px',
      }}
    >
      {children}
    </div>
  );
}

function MemberItem({ member, isOwner }: { member: CommunityMember; isOwner?: boolean }) {
  const topRole = (member.roles ?? []).filter((r) => !r.is_default).sort((a, b) => b.position - a.position)[0];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 16px',
        cursor: 'pointer',
        borderRadius: 12,
        margin: '1px 8px',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Avatar
        src={member.avatar_url}
        name={member.display_name ?? member.username}
        size={32}
        radius={10}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: isOwner ? 'var(--primary)' : topRole?.color ?? '#E6E1E5',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {member.nickname ?? member.display_name ?? member.username}
          {isOwner && (
            <span className="icon" style={{ fontSize: 12, marginLeft: 4, color: 'var(--primary)' }}>star</span>
          )}
        </div>
        {topRole && (
          <div
            style={{
              fontSize: 10,
              color: topRole.color,
              opacity: 0.8,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {topRole.name}
          </div>
        )}
      </div>
    </div>
  );
}
