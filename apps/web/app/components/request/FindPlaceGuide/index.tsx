const GUIDE = [
  {
    title: "お店を登録する",
    body: "Lunt にまだ無いお店は、登録を申請できます。運営が確かめてから公開します。",
  },
  {
    title: "お店の管理者になる",
    body: "掲載されているお店は、お店のページの「このお店を管理する」から管理権限を申請できます。",
  },
  {
    title: "店舗情報と掲載を管理する",
    body: "管理者になると、店舗情報と営業状況、おすすめの品や体験の掲載を自分で更新し、地域やイベントへの参加を申請できます。",
  },
] as const;

/** RQ-01's 店舗向けの案内, shown before searching. */
export function FindPlaceGuide() {
  return (
    <section
      className="notice notice--manage rq01-guide"
      aria-labelledby="rq01-guide-title"
    >
      <h2 className="notice__title" id="rq01-guide-title">
        Lunt でお店ができること
      </h2>
      <ul className="rq01-guide__list">
        {GUIDE.map((item) => (
          <li className="rq01-guide__item" key={item.title}>
            <span className="rq01-guide__title">{item.title}</span>
            <span className="notice__text">{item.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
